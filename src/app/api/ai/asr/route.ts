import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { GROQ_API_KEY } from '@/lib/groq';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ZAI SDK Singleton (fallback)
let zaiClient: any = null;

async function getZAIClient() {
  if (zaiClient) return zaiClient;
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiClient = await ZAI.create();
    return zaiClient;
  } catch (error) {
    console.error('[ASR] Failed to initialize ZAI SDK:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DeltaAI ASR — Groq Whisper PRIMARY, ZAI SDK fallback
// ═══════════════════════════════════════════════════════════════════════
// Groq Whisper large-v3 is ~200ms on LPU — FASTEST ASR available
// ZAI SDK is the reliable fallback (~2s)
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting + Auth: ASR allows guests but with lower rate limits ──
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    let userId: string | undefined;

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

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = (formData.get('language') as string) || 'ar';

    if (!audioFile) {
      return NextResponse.json({ error: 'ملف الصوت مطلوب' }, { status: 400 });
    }

    traceAPI(`ASR: تحويل صوت إلى نص (${language})`);

    // ── PRIMARY: Groq Whisper (fastest, ~200ms on LPU) ──────────────
    try {
      const groqFormData = new FormData();
      groqFormData.append('file', audioFile, audioFile.name || 'audio.webm');
      groqFormData.append('model', 'whisper-large-v3');
      groqFormData.append('language', language);
      groqFormData.append('response_format', 'json');

      const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: groqFormData,
        signal: AbortSignal.timeout(5_000), // 5s timeout
      });

      if (groqResponse.ok) {
        const groqResult = await groqResponse.json();
        const groqText = groqResult.text?.trim();
        if (groqText) {
          traceAPI(`ASR: Groq Whisper نجح (${groqText.length} حرف)`);
          return NextResponse.json({
            text: groqText,
            language,
            provider: 'groq',
          });
        }
      }
      const errBody = await groqResponse.text().catch(() => '');
      console.warn(`[ASR] Groq Whisper failed (${groqResponse.status}): ${errBody.slice(0, 200)}`);
    } catch (groqErr) {
      console.warn('[ASR] Groq Whisper error, falling back to ZAI:', groqErr instanceof Error ? groqErr.message : String(groqErr));
    }

    // ── FALLBACK: ZAI SDK ASR (~2s) ─────────────────────────────────
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');

    // Determine MIME type
    const mimeType = audioFile.type || 'audio/wav';
    const dataUrl = `data:${mimeType};base64,${base64Audio}`;

    const zai = await getZAIClient();
    if (!zai) {
      return NextResponse.json(
        { error: 'خدمة التعرف على الصوت غير متاحة حالياً' },
        { status: 503 }
      );
    }

    // Call ASR API
    const result = await zai.audio.asr.create({
      file: dataUrl,
      language,
    });

    // Extract transcription text from the result
    let text = '';
    if (typeof result === 'string') {
      text = result;
    } else if (result?.text) {
      text = result.text;
    } else if (result?.data?.text) {
      text = result.data.text;
    } else if (Array.isArray(result)) {
      text = result.map((item: any) => item.text || item.content || '').join(' ');
    } else {
      text = JSON.stringify(result);
    }

    traceAPI(`ASR: ZAI SDK نجح (${text.length} حرف)`);

    return NextResponse.json({ text, language, provider: 'zai' });
  } catch (error) {
    console.error('[ASR] Error:', error);
    traceError(`ASR خطأ: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    // Reset client on error
    zaiClient = null;
    return NextResponse.json(
      { error: 'فشل في تحويل الصوت إلى نص' },
      { status: 500 }
    );
  }
}
