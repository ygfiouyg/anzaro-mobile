import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { GROQ_API_KEY } from '@/lib/groq';
import { generateMMSAudio, MMSLanguage, VOICES } from '@/lib/hf-tts.service';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ═══════════════════════════════════════════════════════════════════════
// Anzaro AI TTS — HF MMS TTS → Groq PlayAI → Google Translate → ZAI SDK fallback chain
// ═══════════════════════════════════════════════════════════════════════
// Route 1: HF MMS TTS (facebook/mms-tts-arz for Egyptian, mms-tts-ara for fusha)
//   - Native Arabic TTS from Meta's MMS model
//   - Works on HuggingFace Spaces infrastructure
//   - May be slow on cold start (wait_for_model: true)
// Route 2: Groq PlayAI TTS (~300ms, but IP-blocked in some regions)
// Route 2.5: Google Translate TTS (FREE, no API key, works everywhere!)
// Route 3: ZAI SDK TTS (reliable fallback, ~2s)
// ═══════════════════════════════════════════════════════════════════════

// Groq TTS voice mapping
const GROQ_ARABIC_VOICES = ['Hassan', 'Aisha'] as const;
const GROQ_ENGLISH_VOICES = ['Felix-English', 'Charlotte-English', 'Alice-English'] as const;

// Detect if text is Arabic
function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

// ZAI SDK singleton for TTS (fallback)
let zaiClient: any = null;

async function getZAIClient() {
  if (zaiClient) return zaiClient;
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiClient = await ZAI.create();
    return zaiClient;
  } catch (error) {
    console.error('[TTS] Failed to initialize ZAI SDK:', error);
    return null;
  }
}

// Split text into chunks of max 1024 characters, breaking at sentence boundaries
function splitTextIntoChunks(text: string, maxLength: number = 1000): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      if (sentence.length > maxLength) {
        let remaining = sentence;
        while (remaining.length > 0) {
          const chunk = remaining.slice(0, maxLength);
          remaining = remaining.slice(maxLength);
          chunks.push(chunk.trim());
        }
        currentChunk = '';
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks.filter((c) => c.length > 0);
}

export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting: 30 TTS requests per minute ──
    // Guests get same limit per IP; authenticated users get per-user tracking
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    let userId: string | undefined;

    // Auth check — allow both authenticated AND guest users (for voice chat)
    // But track rate limits differently for logged-in vs guest users
    if (token) {
      const user = await getUserFromToken(token);
      if (user) userId = user.id;
    }

    const rateLimitResponse = checkRateLimit(
      request,
      userId ? { ...RATE_LIMIT_PRESETS.media, maxRequests: 30 } : { ...RATE_LIMIT_PRESETS.media, maxRequests: 10 },
      userId
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Parse request body
    const body = await request.json() as { text?: string; voice?: string; speed?: number; lang?: MMSLanguage };
    const text = body.text;
    const voice = body.voice || 'Hassan';
    const speed = body.speed || 1.0;
    const requestedLang = body.lang;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'النص مطلوب' },
        { status: 400 }
      );
    }

    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'النص طويل جداً (الحد الأقصى 10000 حرف)' },
        { status: 400 }
      );
    }

    const isArabic = isArabicText(text);

    // ── ROUTE 1: HF MMS TTS (Native Arabic TTS from Meta MMS) ──────
    // Only try HF MMS for Arabic text (it doesn't support English)
    if (isArabic) {
      try {
        // Determine language: arz (Egyptian) or ara (fusha)
        // Use explicit lang param if provided, otherwise auto-detect
        const mmsLang: MMSLanguage = requestedLang || 'arz';

        const mmsBuffer = await generateMMSAudio(text.slice(0, 2000), mmsLang);

        if (mmsBuffer.length > 100) {
          traceAPI(`TTS: HF MMS نجح (${mmsBuffer.length} bytes, ${mmsLang})`);
          return new Response(new Uint8Array(mmsBuffer), {
            headers: {
              'Content-Type': 'audio/wav',
              'Content-Length': String(mmsBuffer.length),
              'Cache-Control': 'no-cache',
              'X-TTS-Provider': 'hf-mms',
              'X-Voice-Used': `hf-mms:${mmsLang}`,
            },
          });
        }
      } catch (mmsErr) {
        const errMsg = mmsErr instanceof Error ? mmsErr.message : String(mmsErr);
        console.warn(`[TTS] HF MMS failed, falling back to Groq: ${errMsg.slice(0, 150)}`);
        traceError(`TTS: HF MMS فشل - ${errMsg.slice(0, 80)}`);
      }
    }

    // ── ROUTE 2: Groq PlayAI TTS (fastest, ~300ms on LPU) ─────────
    const groqModel = isArabic ? 'playai-tts-arabic' : 'playai-tts';

    // Resolve Groq voice: use requested voice if it's a Groq voice, otherwise pick default
    let groqVoice = voice;
    if (isArabic) {
      // For Arabic, default to Hassan (male) unless Aisha is specified
      if (!GROQ_ARABIC_VOICES.includes(groqVoice as any)) {
        // Map common voice keys to Groq Arabic voices
        const arabicVoiceMap: Record<string, string> = {
          'egyptian-male': 'Hassan',
          'egyptian-female': 'Aisha',
          'male': 'Hassan',
          'female': 'Aisha',
          'Faris-PlayAI': 'Hassan',
          'Halah-PlayAI': 'Aisha',
          'tongtong': 'Hassan',
          'kazi': 'Hassan',
          'arz': 'Hassan',
          'ara': 'Hassan',
        };
        groqVoice = arabicVoiceMap[voice] || 'Hassan';
      }
    } else {
      // For English, default to Felix-English
      if (!GROQ_ENGLISH_VOICES.includes(groqVoice as any)) {
        const englishVoiceMap: Record<string, string> = {
          'male': 'Felix-English',
          'female': 'Charlotte-English',
          'tongtong': 'Felix-English',
          'kazi': 'Felix-English',
        };
        groqVoice = englishVoiceMap[voice] || 'Felix-English';
      }
    }

    try {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: groqModel,
          voice: groqVoice,
          input: text.slice(0, 5000),
          response_format: 'wav',
          speed: speed,
        }),
        signal: AbortSignal.timeout(8_000), // 8s timeout
      });

      if (groqResponse.ok) {
        const audioBuffer = Buffer.from(await groqResponse.arrayBuffer());
        if (audioBuffer.length > 100) {
          traceAPI(`TTS: Groq PlayAI نجح (${audioBuffer.length} bytes, ${isArabic ? 'عربي' : 'إنجليزي'})`);
          return new Response(new Uint8Array(audioBuffer), {
            headers: {
              'Content-Type': 'audio/wav',
              'Content-Length': String(audioBuffer.length),
              'Cache-Control': 'no-cache',
              'X-TTS-Provider': 'groq',
              'X-Voice-Used': `groq:${groqVoice}`,
            },
          });
        }
      }
      const errBody = await groqResponse.text().catch(() => '');
      console.warn(`[TTS] Groq PlayAI failed (${groqResponse.status}): ${errBody.slice(0, 200)}`);
    } catch (groqErr) {
      console.warn('[TTS] Groq PlayAI error, falling back to Google TTS:', groqErr instanceof Error ? groqErr.message : String(groqErr));
    }

    // ── ROUTE 2.5: Google Translate TTS (FREE, no API key!) ─────────
    // Works everywhere, no API key needed. Good for Arabic & English.
    try {
      const { googleTTS, isArabicText: isArabicGoogle } = await import('@/lib/google-tts');
      const lang = isArabic ? 'ar' : 'en';
      const googleBuffer = await googleTTS(text.slice(0, 5000), lang);
      
      if (googleBuffer.length > 100) {
        traceAPI(`TTS: Google Translate نجح (${googleBuffer.length} bytes, ${lang})`);
        return new Response(new Uint8Array(googleBuffer), {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(googleBuffer.length),
            'Cache-Control': 'no-cache',
            'X-TTS-Provider': 'google-tts',
            'X-Voice-Used': `google-tts:${lang}`,
          },
        });
      }
    } catch (googleErr) {
      console.warn('[TTS] Google Translate TTS failed, falling back to ZAI:', googleErr instanceof Error ? googleErr.message : String(googleErr));
      traceError('TTS: Google Translate فشل');
    }

    // ── ROUTE 3: ZAI SDK TTS (~2s, WAV format) ───────────────────
    const zai = await getZAIClient();
    if (!zai) {
      return NextResponse.json(
        { error: 'خدمة تحويل النص لصوت غير متاحة حالياً' },
        { status: 503 }
      );
    }

    try {
      // Split text into chunks (SDK max is 1024 chars per request)
      const chunks = splitTextIntoChunks(text, 1000);
      const audioBuffers: Buffer[] = [];

      for (const chunk of chunks) {
        const response = await zai.audio.tts.create({
          input: chunk,
          voice: 'kazi',
          speed: speed,
          response_format: 'wav',
          stream: false,
        });

        // SDK returns a standard Response object
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(new Uint8Array(arrayBuffer));
        audioBuffers.push(buffer);
      }

      // Concatenate all audio buffers
      const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
      const combinedBuffer = Buffer.concat(audioBuffers, totalLength);

      traceAPI(`TTS: ZAI SDK نجح (${combinedBuffer.length} bytes)`);

      // Return audio as response
      return new Response(new Uint8Array(combinedBuffer), {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(combinedBuffer.length),
          'Cache-Control': 'no-cache',
          'X-TTS-Provider': 'zai',
        },
      });
    } catch (ttsError: any) {
      console.error('[TTS] TTS generation error:', ttsError);
      // Reset client on error
      zaiClient = null;
      return NextResponse.json(
        { error: 'فشل في تحويل النص لصوت' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[TTS] Unhandled error:', error);
    return NextResponse.json(
      { error: 'خطأ داخلي في الخادم' },
      { status: 500 }
    );
  }
}
