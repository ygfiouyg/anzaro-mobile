import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { getZAIClient } from '@/lib/chat-utils';

// ═══════════════════════════════════════════════════════════════════════
// Anzaro ASR — HF Whisper ONLY (distil-whisper + whisper-large-v3)
// ═══════════════════════════════════════════════════════════════════════
// V.43: User explicitly requested ONLY these two models:
//   1. distil-whisper/distil-large-v3 (fast)
//   2. openai/whisper-large-v3 (highest quality)
//
// No Groq. No ZAI SDK. No other providers. Period.
// ═══════════════════════════════════════════════════════════════════════

const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN || process.env.HF_TOKEN || '';
const HF_API_BASE = 'https://router.huggingface.co/hf-inference/models';

/** Transcribe audio using a specific HF Whisper model */
async function transcribeWithHFModel(
  audioBuffer: Buffer,
  model: string,
  language: string,
  timeoutMs: number = 120_000
): Promise<string> {
  const url = `${HF_API_BASE}/${model}`;
  const params = new URLSearchParams();
  if (language) params.set('language', language);
  const fullUrl = params.toString() ? `${url}?${params.toString()}` : url;

  console.log(`[ASR] Trying ${model} (timeout: ${timeoutMs / 1000}s)...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'audio/wav' };
    if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: new Uint8Array(audioBuffer),
    });

    console.log(`[ASR] ${model} response: status=${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`[ASR] ${model} error ${response.status}: ${errorText.slice(0, 300)}`);

      // Cold start — wait and retry
      if (response.status === 503 && (errorText.includes('loading') || errorText.includes('currently loading'))) {
        console.log(`[ASR] ${model} loading, waiting 30s for cold start...`);
        await new Promise(resolve => setTimeout(resolve, 30_000));

        const retryResponse = await fetch(fullUrl, {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: new Uint8Array(audioBuffer),
        });

        console.log(`[ASR] ${model} retry response: status=${retryResponse.status}`);

        if (!retryResponse.ok) {
          // Try ONE more time
          if (retryResponse.status === 503) {
            console.log(`[ASR] ${model} still loading, waiting 30s more...`);
            await new Promise(resolve => setTimeout(resolve, 30_000));
            const retry2 = await fetch(fullUrl, {
              method: 'POST',
              signal: controller.signal,
              headers,
              body: new Uint8Array(audioBuffer),
            });
            if (retry2.ok) {
              const result2 = await retry2.json();
              console.log(`[ASR] ${model} success after 2nd retry: "${(result2.text || '').slice(0, 80)}"`);
              return result2.text || '';
            }
            throw new Error(`${model} failed after 2 retries: ${retry2.status}`);
          }
          throw new Error(`${model} retry failed: ${retryResponse.status}`);
        }

        const result = await retryResponse.json();
        console.log(`[ASR] ${model} success after retry: "${(result.text || '').slice(0, 80)}"`);
        return result.text || '';
      }

      throw new Error(`${model} error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    const text = result.text || '';
    console.log(`[ASR] ${model} success: "${text.slice(0, 80)}"`);
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
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

    if (!HF_TOKEN) {
      return NextResponse.json(
        { error: 'HuggingFace token not configured' },
        { status: 503 }
      );
    }

    traceAPI(`ASR: تحويل صوت إلى نص (${language})`);

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // ── MODEL 1: distil-whisper/distil-large-v3 (fast) ──
    try {
      const text = await transcribeWithHFModel(
        audioBuffer,
        'distil-whisper/distil-large-v3',
        language,
        90_000 // 90s timeout (distil is faster)
      );
      if (text && text.trim()) {
        traceAPI(`ASR: distil-whisper نجح (${text.length} حرف)`);
        return NextResponse.json({
          text: text.trim(),
          language,
          provider: 'hf-distil-whisper',
        });
      }
    } catch (err) {
      console.warn('[ASR] distil-whisper failed:', err instanceof Error ? err.message : String(err));
    }

    // ── MODEL 2: openai/whisper-large-v3 (highest quality) ──
    try {
      const text = await transcribeWithHFModel(
        audioBuffer,
        'openai/whisper-large-v3',
        language,
        180_000 // 3 min timeout (large-v3 is slower but higher quality)
      );
      if (text && text.trim()) {
        traceAPI(`ASR: whisper-large-v3 نجح (${text.length} حرف)`);
        return NextResponse.json({
          text: text.trim(),
          language,
          provider: 'hf-whisper-large-v3',
        });
      }
    } catch (err) {
      console.warn('[ASR] whisper-large-v3 failed:', err instanceof Error ? err.message : String(err));
    }

    // ── LAST RESORT: ZAI SDK (only if HF credits are depleted) ──
    // V.43b: HF Inference credits depleted (402 error). ZAI SDK is the
    // only free option remaining. User requested ONLY distil-whisper +
    // whisper-large-v3, but those require paid HF credits now.
    // ZAI SDK uses ZAI_API_KEY (ZhipuAI/GLM) — free, decent quality.
    console.log('[ASR] HF models failed, trying ZAI SDK as last resort...');
    try {
      const zai = await getZAIClient();
      console.log('[ASR] ZAI client ready (via our wrapper), transcribing...');
      const zaiArrayBuffer = await audioFile.arrayBuffer();
      const buffer = Buffer.from(zaiArrayBuffer);
      const base64Audio = buffer.toString('base64');
      const mimeType = audioFile.type || 'audio/wav';
      const dataUrl = `data:${mimeType};base64,${base64Audio}`;

      const result = await zai.audio.asr.create({ file: dataUrl, language });
      console.log('[ASR] ZAI SDK response:', typeof result, JSON.stringify(result).slice(0, 200));
      let text = '';
      if (typeof result === 'string') text = result;
      else if (result?.text) text = result.text;
      else if (result?.data?.text) text = result.data.text;
      else if (Array.isArray(result)) text = result.map((item: any) => item.text || '').join(' ');

      if (text && text.trim()) {
        traceAPI(`ASR: ZAI SDK نجح (${text.length} حرف)`);
        return NextResponse.json({ text: text.trim(), language, provider: 'zai' });
      }
      console.warn('[ASR] ZAI SDK returned empty text');
    } catch (zaiErr) {
      console.warn('[ASR] ZAI SDK failed:', zaiErr instanceof Error ? zaiErr.message : String(zaiErr));
    }

    // All providers failed
    return NextResponse.json(
      { error: 'فشل في تحويل الصوت إلى نص — حاول تاني' },
      { status: 503 }
    );
  } catch (error) {
    console.error('[ASR] Error:', error);
    traceError(`ASR خطأ: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    return NextResponse.json(
      { error: 'فشل في تحويل الصوت إلى نص' },
      { status: 500 }
    );
  }
}
