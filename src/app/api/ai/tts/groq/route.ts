import { NextRequest, NextResponse } from 'next/server';
import { GROQ_API_KEY } from '@/lib/groq';
import { traceAPI, traceError } from '@/lib/trace-logger';

// ═══════════════════════════════════════════════════════════════════════
// Anzaro AI Groq TTS — Dedicated PlayAI Dialog TTS Endpoint
// ═══════════════════════════════════════════════════════════════════════
// Uses Groq's PlayAI Dialog models for ultra-fast TTS:
//   - Arabic: playai-tts-arabic (voices: Hassan, Aisha)
//   - English: playai-tts (voices: Felix-English, Charlotte-English, etc.)
//   - ~300ms latency on Groq LPU — FASTEST TTS available
// ═══════════════════════════════════════════════════════════════════════

// Supported Groq TTS voices
const GROQ_ARABIC_VOICES = ['Hassan', 'Aisha'] as const;
const GROQ_ENGLISH_VOICES = ['Felix-English', 'Charlotte-English', 'Alice-English'] as const;
type GroqArabicVoice = typeof GROQ_ARABIC_VOICES[number];
type GroqEnglishVoice = typeof GROQ_ENGLISH_VOICES[number];

// Detect if text is Arabic
function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

// Voice key mapping — maps common voice selectors to Groq voice names
const VOICE_KEY_MAP: Record<string, { arabic: GroqArabicVoice; english: GroqEnglishVoice }> = {
  'egyptian-male': { arabic: 'Hassan', english: 'Felix-English' },
  'egyptian-female': { arabic: 'Aisha', english: 'Charlotte-English' },
  'male': { arabic: 'Hassan', english: 'Felix-English' },
  'female': { arabic: 'Aisha', english: 'Charlotte-English' },
  'Faris-PlayAI': { arabic: 'Hassan', english: 'Felix-English' },
  'Halah-PlayAI': { arabic: 'Aisha', english: 'Charlotte-English' },
  'tongtong': { arabic: 'Hassan', english: 'Felix-English' },
  'kazi': { arabic: 'Hassan', english: 'Felix-English' },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      text?: string;
      voice?: string;
      speed?: number;
    };

    const text = body.text;
    const voiceKey = body.voice || 'egyptian-male';
    const speed = body.speed || 1.0;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'النص مطلوب' },
        { status: 400 }
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'النص طويل جداً (الحد الأقصى 5000 حرف لـ Groq TTS)' },
        { status: 400 }
      );
    }

    // Detect language and select model
    // NOTE: playai-tts and playai-tts-arabic are DECOMMISSIONED
    // Replacement: playai-tts-v2 (supports all languages + voices)
    const isArabic = isArabicText(text);
    const model = 'playai-tts-v2';

    // Resolve voice name
    let voice: string;
    const mapped = VOICE_KEY_MAP[voiceKey];
    if (mapped) {
      voice = isArabic ? mapped.arabic : mapped.english;
    } else if (isArabic && GROQ_ARABIC_VOICES.includes(voiceKey as GroqArabicVoice)) {
      voice = voiceKey;
    } else if (!isArabic && GROQ_ENGLISH_VOICES.includes(voiceKey as GroqEnglishVoice)) {
      voice = voiceKey;
    } else {
      // Default voices
      voice = isArabic ? 'Hassan' : 'Felix-English';
    }

    traceAPI(`[GroqTTS] model=${model}, voice=${voice}, text_len=${text.length}`);

    // Call Groq TTS API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: text.slice(0, 5000),
        response_format: 'wav',
        speed,
      }),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!groqResponse.ok) {
      const errBody = await groqResponse.text().catch(() => '');
      traceError(`[GroqTTS] API error ${groqResponse.status}: ${errBody.slice(0, 200)}`);

      // If it's a voice name error, try with the default voice
      if (errBody.includes('voice') || errBody.includes('Voice')) {
        const defaultVoice = isArabic ? 'Hassan' : 'Felix-English';
        if (voice !== defaultVoice) {
          traceAPI(`[GroqTTS] Retrying with default voice: ${defaultVoice}`);
          const retryResponse = await fetch('https://api.groq.com/openai/v1/audio/speech', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              voice: defaultVoice,
              input: text.slice(0, 5000),
              response_format: 'wav',
              speed,
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (retryResponse.ok) {
            const audioBuffer = Buffer.from(await retryResponse.arrayBuffer());
            if (audioBuffer.length > 100) {
              return new Response(new Uint8Array(audioBuffer), {
                headers: {
                  'Content-Type': 'audio/wav',
                  'Content-Length': String(audioBuffer.length),
                  'Cache-Control': 'no-cache',
                  'X-TTS-Provider': 'groq',
                  'X-Voice-Used': `groq:${defaultVoice}`,
                },
              });
            }
          }
        }
      }

      return NextResponse.json(
        { error: `Groq TTS فشل: ${groqResponse.status}`, details: errBody.slice(0, 300) },
        { status: groqResponse.status === 401 ? 401 : 502 }
      );
    }

    const audioBuffer = Buffer.from(await groqResponse.arrayBuffer());

    if (audioBuffer.length <= 100) {
      traceError(`[GroqTTS] Audio too small: ${audioBuffer.length} bytes`);
      return NextResponse.json(
        { error: 'Groq TTS أرجع صوت فارغ' },
        { status: 502 }
      );
    }

    traceAPI(`[GroqTTS] نجح: ${audioBuffer.length} bytes, model=${model}, voice=${voice}`);

    return new Response(new Uint8Array(audioBuffer), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBuffer.length),
        'Cache-Control': 'no-cache',
        'X-TTS-Provider': 'groq',
        'X-Voice-Used': `groq:${voice}`,
      },
    });
  } catch (error) {
    traceError(`[GroqTTS] Error: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    return NextResponse.json(
      { error: 'Groq TTS خطأ', details: error instanceof Error ? error.message : 'خطأ غير معروف' },
      { status: 500 }
    );
  }
}
