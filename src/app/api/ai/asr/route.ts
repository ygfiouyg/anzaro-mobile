import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { transcribeWithGemini, isGeminiASRAvailable } from '@/lib/gemini-asr';

// ═══════════════════════════════════════════════════════════════════════
// Anzaro ASR — Gemini PRIMARY, HF Whisper fallback
// ═══════════════════════════════════════════════════════════════════════
// V.45: User requested NO ZAI (Chinese company, bad Arabic quality).
// Now uses:
//   1. Google Gemini (PRIMARY — great Arabic dialect support, uses GOOGLE_AI_KEY)
//   2. distil-whisper/distil-large-v3 (fallback — HF credits depleted)
//   3. openai/whisper-large-v3 (fallback — HF credits depleted)
//
// No Groq. No ZAI SDK. Period.
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

    traceAPI(`ASR: تحويل صوت إلى نص (${language})`);

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // ── PRIMARY: Google Gemini (best Arabic dialect support) ──
    // V.45: User explicitly requested NO ZAI — Gemini is the best free option
    if (isGeminiASRAvailable()) {
      try {
        // V.45d: Detect MIME type from file extension if not provided
        // curl sends application/octet-stream which Gemini can't handle
        let audioMime = audioFile.type;
        if (!audioMime || audioMime === 'application/octet-stream') {
          const ext = audioFile.name?.split('.').pop()?.toLowerCase() || '';
          const mimeMap: Record<string, string> = {
            'webm': 'audio/webm',
            'wav': 'audio/wav',
            'mp3': 'audio/mp3',
            'mp4': 'audio/mp4',
            'm4a': 'audio/mp4',
            'ogg': 'audio/ogg',
            'flac': 'audio/flac',
            'aac': 'audio/aac',
          };
          audioMime = mimeMap[ext] || 'audio/webm';
          console.log(`[ASR] Detected MIME from extension .${ext}: ${audioMime}`);
        }
        const text = await transcribeWithGemini(audioBuffer, language, audioMime);
        if (text && text.trim()) {
          traceAPI(`ASR: Gemini نجح (${text.length} حرف)`);
          return NextResponse.json({
            text: text.trim(),
            language,
            provider: 'gemini',
          });
        }
      } catch (geminiErr) {
        console.warn('[ASR] Gemini failed:', geminiErr instanceof Error ? geminiErr.message : String(geminiErr));
      }
    }

    // ── FALLBACK 1: distil-whisper/distil-large-v3 ──
    if (!HF_TOKEN) {
      return NextResponse.json(
        { error: 'خدمة التعرف على الصوت غير متاحة — GOOGLE_AI_KEY و HF_TOKEN غير مكونين' },
        { status: 503 }
      );
    }

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
