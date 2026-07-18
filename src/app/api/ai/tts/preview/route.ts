import { NextRequest, NextResponse } from 'next/server';
import { GROQ_API_KEY } from '@/lib/groq';
import { synthesizeSpeech, ARABIC_VOICES } from '@/lib/edge-tts';
import { generateMMSAudio, MMSLanguage } from '@/lib/hf-tts.service';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ═══════════════════════════════════════════════════════════════════════
// Anzaro AI Voice Preview — Direct TTS with NO fallbacks
// Each voice plays using ONLY its designated provider.
// If that provider fails, we return an error (not a different voice).
// ═══════════════════════════════════════════════════════════════════════

const PREVIEW_TIMEOUT = 12_000;

export async function POST(request: NextRequest) {
  // ── Auth required for TTS preview ──
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token) {
    return NextResponse.json({ error: 'غير مصرح - مطلوب تسجيل الدخول' }, { status: 401 });
  }
  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'غير مصرح - جلسة غير صالحة' }, { status: 401 });
  }

  // ── Rate limiting: 30 TTS requests per minute ──
  const rateLimitResponse = checkRateLimit(request, RATE_LIMIT_PRESETS.media);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json() as {
      text?: string;
      provider?: string;
      voiceId?: string;
      speed?: number;
    };

    const text = body.text || 'مرحبا! أنا بعقل، مساعدك الذكي. ازيك النهاردة؟';
    const provider = body.provider;
    const voiceId = body.voiceId;
    const speed = body.speed || 1.0;

    if (!provider || !voiceId) {
      return NextResponse.json(
        { error: 'provider و voiceId مطلوبين' },
        { status: 400 }
      );
    }

    // ── HF MMS TTS (direct, no fallback) ──
    if (provider === 'hf-mms') {
      // voiceId is the language code: 'arz' (Egyptian Arabic) or 'ara' (Modern Standard Arabic)
      const lang: MMSLanguage = (voiceId === 'ara') ? 'ara' : 'arz';

      try {
        const audioBuffer = await generateMMSAudio(text.slice(0, 2000), lang);

        if (audioBuffer.length <= 100) {
          return NextResponse.json({ error: 'HF MMS أرجع صوت فارغ' }, { status: 502 });
        }

        return new Response(new Uint8Array(audioBuffer), {
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(audioBuffer.length),
            'Cache-Control': 'no-cache',
            'X-TTS-Provider': 'hf-mms',
            'X-Voice-Used': `hf-mms:${lang}`,
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: 'HF MMS TTS خطأ' },
          { status: 502 }
        );
      }
    }

    // ── GROQ TTS (direct, no fallback) ──
    if (provider === 'groq') {
      const isArabic = /[\u0600-\u06FF]/.test(text);
      const model = isArabic ? 'playai-tts-arabic' : 'playai-tts';

      try {
        const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            voice: voiceId,
            input: text.slice(0, 5000),
            response_format: 'wav',
            speed,
          }),
          signal: AbortSignal.timeout(PREVIEW_TIMEOUT),
        });

        if (!groqResponse.ok) {
          const errBody = await groqResponse.text().catch(() => '');
          return NextResponse.json(
            { error: `Groq TTS فشل: ${groqResponse.status}` },
            { status: 502 }
          );
        }

        const audioBuffer = Buffer.from(await groqResponse.arrayBuffer());
        if (audioBuffer.length <= 100) {
          return NextResponse.json({ error: 'Groq أرجع صوت فارغ' }, { status: 502 });
        }

        return new Response(new Uint8Array(audioBuffer), {
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(audioBuffer.length),
            'Cache-Control': 'no-cache',
            'X-TTS-Provider': 'groq',
            'X-Voice-Used': `groq:${voiceId}`,
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: 'Groq TTS خطأ' },
          { status: 502 }
        );
      }
    }

    // ── EDGE TTS (direct, no fallback) ──
    if (provider === 'edge') {
      const voice = voiceId;

      let rate = '+0%';
      if (speed > 1.0) rate = `+${Math.round((speed - 1) * 100)}%`;
      else if (speed < 1.0) rate = `-${Math.round((1 - speed) * 100)}%`;

      try {
        const audioBuffer = await synthesizeSpeech({
          text,
          voice,
          rate,
        });

        return new Response(new Uint8Array(audioBuffer), {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(audioBuffer.length),
            'Cache-Control': 'no-cache',
            'X-TTS-Provider': 'edge',
            'X-Voice-Used': `edge:${voice}`,
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: 'Edge TTS خطأ' },
          { status: 502 }
        );
      }
    }

    // ── ZAI SDK TTS (direct, no fallback) ──
    if (provider === 'zai') {
      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();

        // Split text for ZAI SDK (max 1024 chars)
        const chunks: string[] = [];
        const sentences = text.match(/[^.!?۔！？\n،؛]+[.!?؟。\n،؛]*/g) || [text];
        let currentChunk = '';
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length <= 1000) {
            currentChunk += sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());

        const audioBuffers: Buffer[] = [];
        for (const chunk of chunks) {
          const response = await zai.audio.tts.create({
            input: chunk,
            voice: voiceId,
            speed,
            response_format: 'wav',
            stream: false,
          });
          const arrayBuffer = await response.arrayBuffer();
          audioBuffers.push(Buffer.from(new Uint8Array(arrayBuffer)));
        }

        const combinedBuffer = Buffer.concat(audioBuffers);
        return new Response(new Uint8Array(combinedBuffer), {
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(combinedBuffer.length),
            'Cache-Control': 'no-cache',
            'X-TTS-Provider': 'zai',
            'X-Voice-Used': `zai:${voiceId}`,
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: 'ZAI TTS خطأ' },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: `مزود غير معروف: ${provider}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[TTSPreview] Error:', error);
    return NextResponse.json(
      { error: 'خطأ داخلي في الخادم' },
      { status: 500 }
    );
  }
}
