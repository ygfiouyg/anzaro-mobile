import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { transcribeAudio as hfTranscribe } from '@/lib/hf-asr.service';

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
// Anzaro ASR — HF Whisper PRIMARY (high quality), ZAI SDK fallback
// ═══════════════════════════════════════════════════════════════════════
// V.42: Removed Groq entirely — user reported it's "فاشل" (failing).
// Now uses:
//   1. HuggingFace whisper-large-v3 (HIGHEST QUALITY, free) — PRIMARY
//   2. ZAI SDK ASR (fallback)
//
// User explicitly said: "مش شرط عندي السرعه خالص اهم حاجة الجوده"
// (speed doesn't matter, quality is what matters)
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting + Auth ──
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

    // ── PRIMARY: HuggingFace Whisper large-v3 (HIGHEST QUALITY) ──────
    // V.42: Groq removed — user reported quality issues.
    // HF whisper-large-v3 is the most accurate Whisper model available.
    // It's free via HuggingFace Inference API.
    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      const hfResult = await hfTranscribe({
        audioData: arrayBuffer,
        language,
        provider: 'hf-whisper', // whisper-large-v3 (most accurate)
      });
      if (hfResult.text && hfResult.text.trim()) {
        traceAPI(`ASR: HF Whisper نجح (${hfResult.text.length} حرف)`);
        return NextResponse.json({
          text: hfResult.text,
          language,
          provider: 'hf-whisper',
        });
      }
    } catch (hfErr) {
      console.warn('[ASR] HF Whisper failed, trying ZAI:', hfErr instanceof Error ? hfErr.message : String(hfErr));
    }

    // ── FALLBACK: ZAI SDK ASR ────────────────────────────────────────
    const zaiArrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(zaiArrayBuffer);
    const base64Audio = buffer.toString('base64');

    const mimeType = audioFile.type || 'audio/wav';
    const dataUrl = `data:${mimeType};base64,${base64Audio}`;

    const zai = await getZAIClient();
    if (!zai) {
      return NextResponse.json(
        { error: 'خدمة التعرف على الصوت غير متاحة حالياً' },
        { status: 503 }
      );
    }

    const result = await zai.audio.asr.create({
      file: dataUrl,
      language,
    });

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
    zaiClient = null;
    return NextResponse.json(
      { error: 'فشل في تحويل الصوت إلى نص' },
      { status: 500 }
    );
  }
}
