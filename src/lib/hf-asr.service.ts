// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — HuggingFace ASR Service
// ═══════════════════════════════════════════════════════════════════════
// FREE ASR via HuggingFace Inference API:
//   - distil-whisper/distil-large-v3 (fast, distilled Whisper)
//   - openai/whisper-large-v3 (most accurate)
//   - ZAI SDK fallback
// ═══════════════════════════════════════════════════════════════════════

import { getHFHeaders, HF_API_BASE } from './huggingface';
import { getZAIClient } from './chat-utils';

// V.42: Increased from 30s to 120s — whisper-large-v3 has cold start
// that can take 60-90s on first call. User wants quality over speed.
const ASR_TIMEOUT_MS = 120_000;

export type ASRProvider = 'hf-distil-whisper' | 'hf-whisper' | 'zai';

export interface ASRRequest {
  audioData: ArrayBuffer | Buffer;
  language?: string;
  provider?: ASRProvider;
}

export interface ASRResponse {
  text: string;
  provider: string;
  language: string;
}

/**
 * Transcribe audio using HuggingFace Inference API (Whisper).
 */
async function transcribeWithHF(
  audioData: ArrayBuffer | Buffer,
  model: string,
  language?: string
): Promise<string> {
  const url = `${HF_API_BASE}/${model}`;
  const buffer = audioData instanceof ArrayBuffer ? Buffer.from(audioData) : audioData;

  console.log(`[HF-ASR] Transcribing: model=${model}, audioSize=${(buffer.length / 1024).toFixed(1)}KB`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASR_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    // V.42: Read HF token from multiple env vars (HF Space uses different names)
    const hfToken = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN || process.env.HF_TOKEN || '';
    if (hfToken) {
      headers['Authorization'] = `Bearer ${hfToken}`;
    }

    const params = new URLSearchParams();
    if (language) params.set('language', language);
    const queryString = params.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    const response = await fetch(fullUrl, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');

      // Cold start — wait and retry (V.42: increased wait from 20s to 30s)
      if (response.status === 503 && (errorText.includes('loading') || errorText.includes('currently loading'))) {
        console.log(`[HF-ASR] Model ${model} loading, waiting 30s for cold start...`);
        await new Promise(resolve => setTimeout(resolve, 30_000));

        const retryResponse = await fetch(fullUrl, {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: new Uint8Array(buffer),
        });

        if (!retryResponse.ok) {
          const retryError = await retryResponse.text().catch(() => '');
          // V.42: Try ONE more time if still loading
          if (retryResponse.status === 503) {
            console.log(`[HF-ASR] Still loading, waiting 30s more...`);
            await new Promise(resolve => setTimeout(resolve, 30_000));
            const retry2 = await fetch(fullUrl, {
              method: 'POST',
              signal: controller.signal,
              headers,
              body: new Uint8Array(buffer),
            });
            if (retry2.ok) {
              const result2 = await retry2.json();
              console.log(`[HF-ASR] Success after 2nd retry: "${(result2.text || '').slice(0, 50)}"`);
              return result2.text || '';
            }
            const err2 = await retry2.text().catch(() => '');
            throw new Error(`HF ASR error after 2 retries ${retry2.status}: ${err2.slice(0, 200)}`);
          }
          throw new Error(`HF ASR error after retry ${retryResponse.status}: ${retryError.slice(0, 200)}`);
        }

        const result = await retryResponse.json();
        console.log(`[HF-ASR] Success after retry: "${(result.text || '').slice(0, 50)}"`);
        return result.text || '';
      }

      throw new Error(`HF ASR error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    console.log(`[HF-ASR] Success: "${(result.text || '').slice(0, 50)}"`);
    return result.text || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Transcribe audio using ZAI SDK.
 */
async function transcribeWithZAI(
  audioData: ArrayBuffer | Buffer,
  language: string = 'ar'
): Promise<string> {
  const buffer = audioData instanceof ArrayBuffer ? Buffer.from(audioData) : audioData;
  const base64Audio = buffer.toString('base64');
  const dataUrl = `data:audio/wav;base64,${base64Audio}`;

  console.log(`[ZAI-ASR] Transcribing: language=${language}, audioSize=${(buffer.length / 1024).toFixed(1)}KB`);

  const zai = await getZAIClient();
  const result = await zai.audio.asr.create({
    file: dataUrl,
    language,
  });

  // Extract text from various response shapes
  let text = '';
  if (typeof result === 'string') {
    text = result;
  } else if (result?.text) {
    text = result.text;
  } else if (result?.data?.text) {
    text = result.data.text;
  } else if (Array.isArray(result)) {
    text = result.map((item: any) => item.text || item.content || '').join(' ');
  }

  console.log(`[ZAI-ASR] Success: "${text.slice(0, 50)}"`);
  return text;
}

/**
 * Transcribe audio with automatic provider fallback.
 * Tries HF distil-whisper first, then ZAI SDK.
 */
export async function transcribeAudio(request: ASRRequest): Promise<ASRResponse> {
  const { audioData, language = 'ar', provider = 'hf-distil-whisper' } = request;

  const providers: ASRProvider[] = [];
  if (provider === 'hf-distil-whisper') {
    providers.push('hf-distil-whisper', 'zai');
  } else if (provider === 'hf-whisper') {
    providers.push('hf-whisper', 'zai');
  } else {
    providers.push('zai');
  }

  let lastError: Error | null = null;

  for (const p of providers) {
    try {
      let text: string;

      switch (p) {
        case 'hf-distil-whisper':
          text = await transcribeWithHF(audioData, 'distil-whisper/distil-large-v3', language);
          break;
        case 'hf-whisper':
          text = await transcribeWithHF(audioData, 'openai/whisper-large-v3', language);
          break;
        case 'zai':
          text = await transcribeWithZAI(audioData, language);
          break;
        default:
          continue;
      }

      if (text && text.trim()) {
        return { text: text.trim(), provider: p, language };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[ASR] Provider ${p} failed:`, lastError.message);
    }
  }

  throw lastError || new Error('All ASR providers failed');
}
