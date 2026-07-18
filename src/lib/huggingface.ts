// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Inference API Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides FREE AI access via HuggingFace Inference API:
//   - Chat/text generation (Llama 3.1, Qwen 2.5, Mistral 7B, Phi-3, Zephyr, OpenHermes)
//   - Image generation (FLUX.1-schnell, SDXL, SD3-Medium, Playground v2.5, SD v1.5)
//   - Automatic Speech Recognition (Whisper Large V3)
//   - Translation (NLLB-200-distilled-600M)
//   - Summarization (BART Large CNN)
//
// Endpoints:
//   - Chat (OpenAI-compatible): https://router.huggingface.co/v1/chat/completions
//   - Image/ASR/Translation/Summary: https://router.huggingface.co/hf-inference/models/{model_id}
//
// Key advantage: Free tier with API token (rate-limited, $0.10/month credits).
// With a token, models load faster and have higher rate limits.
// Models can be "cold" (need loading) which takes 20-120s on first call.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceImage, traceError } from '@/lib/trace-logger';

// ─── API Base URLs ────────────────────────────────────────────────────
// Unified OpenAI-compatible endpoint for chat completions
const HF_ROUTER_V1_BASE = 'https://router.huggingface.co/v1';

// HF Inference provider endpoint for image, ASR, translation, summarization
const HF_INFERENCE_BASE = 'https://api-inference.huggingface.co/models';

/** Alias for route imports — the base URL for HuggingFace Inference API (image, ASR, etc.) */
export const HF_API_BASE = HF_INFERENCE_BASE;

/** Alias for route imports — the base URL for HuggingFace Router API (chat completions) */
export const HF_ROUTER_BASE = 'https://router.huggingface.co';

// ─── HuggingFace API Token ──────────────────────────────────────────
// Read from environment variable. Set HUGGINGFACE_API_TOKEN in .env
const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';

/** Get headers for HuggingFace API requests, including auth if token is set */
export function getHFHeaders(contentType = 'application/json'): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (HF_API_TOKEN) {
    headers['Authorization'] = `Bearer ${HF_API_TOKEN}`;
  }
  return headers;
}

// ─── Default Timeouts ────────────────────────────────────────────────
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const IMAGE_TIMEOUT_MS = 180_000; // 3 min — image gen + cold start
const VERIFY_TIMEOUT_MS = 15_000; // 15s for model verification
const MAX_RETRIES = 1;            // HF free is rate-limited, don't retry too much
const RETRY_DELAY_MS = 3_000;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type HFChatModel =
  | 'mistralai/Mistral-7B-Instruct-v0.3'
  | 'meta-llama/Meta-Llama-3-8B-Instruct'
  | 'meta-llama/Llama-3.1-8B-Instruct'
  | 'Qwen/Qwen2-7B-Instruct'
  | 'Qwen/Qwen2.5-7B-Instruct'
  | 'microsoft/Phi-3-mini-4k-instruct'
  | 'HuggingFaceH4/zephyr-7b-beta'
  | 'teknium/OpenHermes-2.5-Mistral-7B';

export type HFImageModel =
  | 'black-forest-labs/FLUX.1-schnell'
  | 'stabilityai/stable-diffusion-xl-base-1.0'
  | 'stabilityai/stable-diffusion-3-medium'
  | 'playgroundai/playground-v2.5-1024px-aesthetic'
  | 'runwayml/stable-diffusion-v1-5';

export type HFASRModel = 'openai/whisper-large-v3';

export type HFTranslationModel = 'facebook/nllb-200-distilled-600M';

export type HFSummarizationModel = 'facebook/bart-large-cnn';

export interface HFChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HFChatRequest {
  messages: HFChatMessage[];
  model?: HFChatModel;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface HFChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter';
  }>;
}

export interface HFImageRequest {
  prompt: string;
  model?: HFImageModel;
  width?: number;
  height?: number;
}

export interface HFImageResponse {
  base64: string;
  format: 'jpg' | 'png' | 'webp';
  mimeType: string;
  model: string;
  prompt: string;
}

export interface HFASRRequest {
  audioData: ArrayBuffer;
  model?: HFASRModel;
  language?: string;
}

export interface HFASRResponse {
  text: string;
  model: string;
  chunks?: Array<{
    timestamp: [number, number];
    text: string;
  }>;
}

export interface HFTranslationRequest {
  text: string;
  model?: HFTranslationModel;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface HFTranslationResponse {
  translationText: string;
  model: string;
}

export interface HFSummarizationRequest {
  text: string;
  model?: HFSummarizationModel;
  minLength?: number;
  maxLength?: number;
}

export interface HFSummarizationResponse {
  summaryText: string;
  model: string;
}

// ─── Model Mapping Types ──────────────────────────────────────────────

export type HFModelCategory = 'chat' | 'image' | 'asr' | 'translation' | 'summarization';

export interface HFModelMappingEntry {
  /** HuggingFace model ID (e.g., 'meta-llama/Llama-3.1-8B-Instruct') */
  hfModel: string;
  /** Human-readable label */
  label: string;
  /** Short label for UI */
  shortLabel: string;
  /** Badge color for UI */
  badgeColor: string;
  /** Style prefix for image models */
  stylePrefix: string;
  /** Category for grouping */
  category: HFModelCategory;
  /** Whether this model is currently available (checked periodically) */
  available: boolean;
}

// ─── Verification Report Types ────────────────────────────────────────

export type HFModelStatus = 'available' | 'loading' | 'failed';

export interface HFModelVerificationResult {
  /** HuggingFace model ID */
  modelId: string;
  /** DeltaAI frontend key (if mapped) */
  frontendKey?: string;
  /** Category of the model */
  category: HFModelCategory;
  /** Status: available, loading (cold start), or failed */
  status: HFModelStatus;
  /** Response time in ms (0 if failed) */
  responseTimeMs: number;
  /** Error message if failed */
  error?: string;
}

export interface HFVerificationReport {
  /** Timestamp of the verification */
  timestamp: string;
  /** Total number of models checked */
  totalModels: number;
  /** Number of available models */
  available: number;
  /** Number of loading (cold start) models */
  loading: number;
  /** Number of failed models */
  failed: number;
  /** Detailed results for each model */
  results: HFModelVerificationResult[];
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → HuggingFace models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chat model mapping: DeltaAI frontend model IDs → HuggingFace models.
 */
export const HF_CHAT_MODEL_MAP: Record<string, HFModelMappingEntry> = {
  'hf-mistral-7b': {
    hfModel: 'mistralai/Mistral-7B-Instruct-v0.3',
    label: 'Mistral 7B Instruct v0.3 (HuggingFace)',
    shortLabel: 'Mistral 7B',
    badgeColor: 'bg-orange-500',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
  'hf-llama-3-8b': {
    hfModel: 'meta-llama/Meta-Llama-3-8B-Instruct',
    label: 'LLaMA 3 8B Instruct (HuggingFace)',
    shortLabel: 'LLaMA 3 8B',
    badgeColor: 'bg-blue-500',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
  'hf-llama-3.1-8b': {
    hfModel: 'meta-llama/Llama-3.1-8B-Instruct',
    label: 'LLaMA 3.1 8B Instruct (HuggingFace)',
    shortLabel: 'LLaMA 3.1 8B',
    badgeColor: 'bg-blue-600',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
  'hf-qwen2-7b': {
    hfModel: 'Qwen/Qwen2-7B-Instruct',
    label: 'Qwen2 7B Instruct (HuggingFace)',
    shortLabel: 'Qwen2 7B',
    badgeColor: 'bg-purple-500',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
  'hf-qwen2.5-7b': {
    hfModel: 'Qwen/Qwen2.5-7B-Instruct',
    label: 'Qwen2.5 7B Instruct (HuggingFace)',
    shortLabel: 'Qwen2.5 7B',
    badgeColor: 'bg-purple-600',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
  'hf-phi3-mini': {
    hfModel: 'microsoft/Phi-3-mini-4k-instruct',
    label: 'Phi-3 Mini 4K (HuggingFace)',
    shortLabel: 'Phi-3 Mini',
    badgeColor: 'bg-teal-500',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
  'hf-zephyr-7b': {
    hfModel: 'HuggingFaceH4/zephyr-7b-beta',
    label: 'Zephyr 7B Beta (HuggingFace)',
    shortLabel: 'Zephyr 7B',
    badgeColor: 'bg-yellow-600',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
  'hf-openhermes': {
    hfModel: 'teknium/OpenHermes-2.5-Mistral-7B',
    label: 'OpenHermes 2.5 Mistral 7B (HuggingFace)',
    shortLabel: 'OpenHermes 2.5',
    badgeColor: 'bg-rose-500',
    stylePrefix: '',
    category: 'chat',
    available: true,
  },
};

/**
 * Image model mapping: DeltaAI frontend model IDs → HuggingFace models.
 */
export const HF_IMAGE_MODEL_MAP: Record<string, HFModelMappingEntry> = {
  'hf-flux-schnell': {
    hfModel: 'black-forest-labs/FLUX.1-schnell',
    label: 'FLUX.1 Schnell (HuggingFace)',
    shortLabel: 'FLUX Schnell',
    badgeColor: 'bg-orange-500',
    stylePrefix: '',
    category: 'image',
    available: true,
  },
  'hf-sdxl': {
    hfModel: 'stabilityai/stable-diffusion-xl-base-1.0',
    label: 'Stable Diffusion XL (HuggingFace)',
    shortLabel: 'SDXL',
    badgeColor: 'bg-indigo-500',
    stylePrefix: '',
    category: 'image',
    available: false, // ❌ 410 Deprecated on HF Inference API
  },
  'hf-sd3-medium': {
    hfModel: 'stabilityai/stable-diffusion-3-medium',
    label: 'Stable Diffusion 3 Medium (HuggingFace)',
    shortLabel: 'SD3 Medium',
    badgeColor: 'bg-violet-500',
    stylePrefix: '',
    category: 'image',
    available: false, // ❌ 400 Not Supported on HF Inference API
  },
  'hf-playground-v2': {
    hfModel: 'playgroundai/playground-v2.5-1024px-aesthetic',
    label: 'Playground v2.5 Aesthetic (HuggingFace)',
    shortLabel: 'Playground v2.5',
    badgeColor: 'bg-emerald-500',
    stylePrefix: 'aesthetic, beautiful, artistic, ',
    category: 'image',
    available: false, // ❌ 400 Not Supported on HF Inference API
  },
  'hf-sd-v1-5': {
    hfModel: 'runwayml/stable-diffusion-v1-5',
    label: 'Stable Diffusion v1.5 (HuggingFace)',
    shortLabel: 'SD v1.5',
    badgeColor: 'bg-slate-500',
    stylePrefix: '',
    category: 'image',
    available: false, // ❌ Not working on HF Inference API
  },
};

/**
 * ASR model mapping: DeltaAI frontend model IDs → HuggingFace models.
 */
export const HF_ASR_MODEL_MAP: Record<string, HFModelMappingEntry> = {
  'hf-whisper-large-v3': {
    hfModel: 'openai/whisper-large-v3',
    label: 'Whisper Large V3 (HuggingFace)',
    shortLabel: 'Whisper V3',
    badgeColor: 'bg-red-500',
    stylePrefix: '',
    category: 'asr',
    available: true,
  },
};

/**
 * Translation model mapping: DeltaAI frontend model IDs → HuggingFace models.
 */
export const HF_TRANSLATION_MODEL_MAP: Record<string, HFModelMappingEntry> = {
  'hf-nllb-200': {
    hfModel: 'facebook/nllb-200-distilled-600M',
    label: 'NLLB-200 Distilled 600M (HuggingFace)',
    shortLabel: 'NLLB-200',
    badgeColor: 'bg-cyan-500',
    stylePrefix: '',
    category: 'translation',
    available: true,
  },
};

/**
 * Summarization model mapping: DeltaAI frontend model IDs → HuggingFace models.
 */
export const HF_SUMMARIZATION_MODEL_MAP: Record<string, HFModelMappingEntry> = {
  'hf-bart-large-cnn': {
    hfModel: 'facebook/bart-large-cnn',
    label: 'BART Large CNN (HuggingFace)',
    shortLabel: 'BART CNN',
    badgeColor: 'bg-amber-500',
    stylePrefix: '',
    category: 'summarization',
    available: true,
  },
};

/**
 * Combined map of ALL HuggingFace model mappings (all categories).
 */
export const HF_ALL_MODEL_MAP: Record<string, HFModelMappingEntry> = {
  ...HF_CHAT_MODEL_MAP,
  ...HF_IMAGE_MODEL_MAP,
  ...HF_ASR_MODEL_MAP,
  ...HF_TRANSLATION_MODEL_MAP,
  ...HF_SUMMARIZATION_MODEL_MAP,
};

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Detect image format from base64 magic bytes.
 */
export function detectImageFormat(base64: string): { ext: 'jpg' | 'png' | 'webp'; mimeType: string } {
  if (base64.startsWith('/9j/')) return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (base64.startsWith('iVBOR')) return { ext: 'png', mimeType: 'image/png' };
  if (base64.startsWith('UklGR')) return { ext: 'webp', mimeType: 'image/webp' };
  return { ext: 'jpg', mimeType: 'image/jpeg' };
}

/**
 * Check if a HuggingFace model is currently loaded and available.
 * Returns true if the model responds within the timeout.
 */
export async function isModelAvailable(modelId: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${HF_INFERENCE_BASE}/${modelId}`, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({ inputs: 'test', parameters: { max_new_tokens: 1 } }),
    });

    if (timeoutId) clearTimeout(timeoutId);

    // If we get a 503 with "loading", the model exists but is cold
    if (response.status === 503) {
      const data = await response.json().catch(() => ({}));
      if (data.error?.includes('loading') || data.error?.includes('currently loading')) {
        return true; // Model exists, just needs loading
      }
      return false;
    }

    // If we get any other response, the model is available
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Get the HuggingFace chat model mapping for a DeltaAI frontend model ID.
 */
export function getHFChatModelMapping(modelId?: string): HFModelMappingEntry | null {
  if (!modelId) return null;
  return HF_CHAT_MODEL_MAP[modelId] || null;
}

/**
 * Get the HuggingFace image model mapping for a DeltaAI frontend model ID.
 */
export function getHFImageModelMapping(modelId?: string): HFModelMappingEntry | null {
  if (!modelId) return null;
  return HF_IMAGE_MODEL_MAP[modelId] || null;
}

/**
 * Get the HuggingFace ASR model mapping for a DeltaAI frontend model ID.
 */
export function getHFASRModelMapping(modelId?: string): HFModelMappingEntry | null {
  if (!modelId) return null;
  return HF_ASR_MODEL_MAP[modelId] || null;
}

/**
 * Get the HuggingFace translation model mapping for a DeltaAI frontend model ID.
 */
export function getHFTranslationModelMapping(modelId?: string): HFModelMappingEntry | null {
  if (!modelId) return null;
  return HF_TRANSLATION_MODEL_MAP[modelId] || null;
}

/**
 * Get the HuggingFace summarization model mapping for a DeltaAI frontend model ID.
 */
export function getHFSummarizationModelMapping(modelId?: string): HFModelMappingEntry | null {
  if (!modelId) return null;
  return HF_SUMMARIZATION_MODEL_MAP[modelId] || null;
}

/**
 * Check if a model ID is a HuggingFace model.
 */
export function isHuggingFaceModel(modelId?: string): boolean {
  if (!modelId) return false;
  return modelId.startsWith('hf-');
}

/**
 * Check if a model ID is a HuggingFace chat model.
 */
export function isHFChatModel(modelId?: string): boolean {
  return !!modelId && modelId in HF_CHAT_MODEL_MAP;
}

/**
 * Check if a model ID is a HuggingFace image model.
 */
export function isHFImageModel(modelId?: string): boolean {
  return !!modelId && modelId in HF_IMAGE_MODEL_MAP;
}

/**
 * Check if a model ID is a HuggingFace ASR model.
 */
export function isHFASRModel(modelId?: string): boolean {
  return !!modelId && modelId in HF_ASR_MODEL_MAP;
}

/**
 * Check if a model ID is a HuggingFace translation model.
 */
export function isHFTranslationModel(modelId?: string): boolean {
  return !!modelId && modelId in HF_TRANSLATION_MODEL_MAP;
}

/**
 * Check if a model ID is a HuggingFace summarization model.
 */
export function isHFSummarizationModel(modelId?: string): boolean {
  return !!modelId && modelId in HF_SUMMARIZATION_MODEL_MAP;
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT GENERATION (OpenAI-Compatible Endpoint)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a chat completion using HuggingFace Inference API.
 * Uses the OpenAI-compatible chat completions endpoint.
 *
 * Endpoint: POST https://router.huggingface.co/v1/chat/completions
 */
export async function generateChatCompletion(request: HFChatRequest): Promise<HFChatResponse> {
  const {
    messages,
    model = 'meta-llama/Llama-3.1-8B-Instruct',
    temperature = 0.7,
    max_tokens = 2048,
    top_p = 0.9,
  } = request;

  const url = `${HF_ROUTER_V1_BASE}/chat/completions`;

  traceImage(`[HuggingFace] Chat completion: model=${model}`);

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        top_p,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');

      // Model is loading (cold start)
      if (response.status === 503 && errorText.includes('loading')) {
        const estimatedTime = errorText.match(/estimated_time.*?(\d+)/)?.[1] || '60';
        throw new Error(`HuggingFace model ${model} is loading. Estimated time: ${estimatedTime}s`);
      }

      throw new Error(`HuggingFace chat error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();

    traceImage(`[HuggingFace] Chat completion success: model=${model}`);

    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Stream a chat completion using HuggingFace Inference API.
 * Returns an async iterator of chat chunks (OpenAI SSE format).
 *
 * Endpoint: POST https://router.huggingface.co/v1/chat/completions
 */
export async function* streamChatCompletion(request: HFChatRequest): AsyncGenerator<{
  id: string;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}> {
  const {
    messages,
    model = 'meta-llama/Llama-3.1-8B-Instruct',
    temperature = 0.7,
    max_tokens = 2048,
    top_p = 0.9,
  } = request;

  const url = `${HF_ROUTER_V1_BASE}/chat/completions`;

  traceImage(`[HuggingFace] Streaming chat: model=${model}`);

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        top_p,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');

      // Model is loading (cold start) - try non-streaming fallback
      if (response.status === 503 && errorText.includes('loading')) {
        traceImage(`[HuggingFace] Model ${model} is loading (cold start), waiting...`);
        // Wait and retry once
        await sleep(10_000);
        const retryResponse = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: getHFHeaders(),
          body: JSON.stringify({ model, messages, temperature, max_tokens, top_p, stream: true }),
        });

        if (!retryResponse.ok) {
          const retryError = await retryResponse.text().catch(() => '');
          throw new Error(`HuggingFace chat error after retry ${retryResponse.status}: ${retryError.slice(0, 200)}`);
        }

        // Process the retry response
        yield* processStreamResponse(retryResponse);
        return;
      }

      throw new Error(`HuggingFace streaming chat error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    yield* processStreamResponse(response);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Process a streaming response from HuggingFace (SSE format, OpenAI-compatible).
 */
async function* processStreamResponse(response: Response): AsyncGenerator<{
  id: string;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable stream from HuggingFace');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

        const dataStr = trimmedLine.slice(5).trim();
        if (dataStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(dataStr);
          yield parsed;
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING CHAT — High-Level Convenience Function
// ═══════════════════════════════════════════════════════════════════════

/**
 * High-level streaming chat function using the OpenAI-compatible endpoint.
 * Use this for chat streaming — it handles the HF token and SSE parsing.
 *
 * @param messages - Array of chat messages in OpenAI format
 * @param model - HuggingFace model ID (defaults to Llama-3.1-8B-Instruct)
 * @param options - Optional temperature, max_tokens, top_p
 * @returns AsyncGenerator yielding content strings (plain text chunks)
 *
 * @example
 * ```ts
 * for await (const chunk of streamHFChat(messages, 'meta-llama/Llama-3.1-8B-Instruct')) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export async function* streamHFChat(
  messages: HFChatMessage[],
  model: HFChatModel = 'meta-llama/Llama-3.1-8B-Instruct',
  options?: { temperature?: number; max_tokens?: number; top_p?: number }
): AsyncGenerator<string> {
  const url = `${HF_ROUTER_V1_BASE}/chat/completions`;

  traceImage(`[HuggingFace] streamHFChat: model=${model}`);

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 2048,
        top_p: options?.top_p ?? 0.9,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');

      // Model loading — wait and retry once
      if (response.status === 503 && errorText.includes('loading')) {
        traceImage(`[HuggingFace] Model ${model} loading, retrying in 10s...`);
        await sleep(10_000);

        const retryResponse = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: getHFHeaders(),
          body: JSON.stringify({
            model,
            messages,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.max_tokens ?? 2048,
            top_p: options?.top_p ?? 0.9,
            stream: true,
          }),
        });

        if (!retryResponse.ok) {
          const retryError = await retryResponse.text().catch(() => '');
          throw new Error(`HuggingFace streamHFChat error after retry ${retryResponse.status}: ${retryError.slice(0, 200)}`);
        }

        yield* extractContentFromStream(retryResponse);
        return;
      }

      throw new Error(`HuggingFace streamHFChat error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    yield* extractContentFromStream(response);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Extract plain text content from an SSE stream response.
 */
async function* extractContentFromStream(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable stream from HuggingFace');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

        const dataStr = trimmedLine.slice(5).trim();
        if (dataStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(dataStr);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) yield content;
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// IMAGE GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate an image using HuggingFace Inference API.
 * No API key needed for free tier (but rate-limited).
 *
 * Endpoint: POST https://router.huggingface.co/hf-inference/models/{model}
 * Body: { "inputs": "prompt text" }
 * Response: Raw image binary
 */
export async function generateImage(request: HFImageRequest): Promise<HFImageResponse> {
  const {
    prompt,
    model = 'black-forest-labs/FLUX.1-schnell',
    width = 1024,
    height = 1024,
  } = request;

  const url = `${HF_INFERENCE_BASE}/${model}`;

  traceImage(`[HuggingFace] Image gen: model=${model}, ${width}x${height}`);

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: getHFHeaders(),
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            width: Math.min(width, 1024), // HF free tier has size limits
            height: Math.min(height, 1024),
          },
        }),
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');

        // Model is loading (cold start) - wait and retry
        if (response.status === 503 && (errorText.includes('loading') || errorText.includes('currently loading'))) {
          const estimatedTime = errorText.match(/estimated_time.*?(\d+\.?\d*)/)?.[1] || '60';
          const waitTime = Math.min(parseFloat(estimatedTime) * 1000, 60_000);
          traceImage(`[HuggingFace] Model ${model} is loading, waiting ${Math.round(waitTime / 1000)}s...`);
          await sleep(waitTime);
          continue;
        }

        // Rate limited
        if (response.status === 429) {
          traceImage(`[HuggingFace] Rate limited, waiting before retry...`);
          await sleep(5_000);
          continue;
        }

        throw new Error(`HuggingFace image error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const contentType = response.headers.get('content-type') || '';

      // If we got JSON instead of image, something went wrong
      if (contentType.includes('application/json')) {
        const jsonResult = await response.json();
        throw new Error(`HuggingFace returned JSON instead of image: ${JSON.stringify(jsonResult).slice(0, 200)}`);
      }

      // Download the image binary and convert to base64
      const arrayBuffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      const detected = detectImageFormat(base64);

      traceImage(`[HuggingFace] Image gen success: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB, ${detected.ext}`);

      return {
        base64,
        format: detected.ext,
        mimeType: detected.mimeType,
        model,
        prompt,
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));
      traceError(`[HuggingFace] Image gen error: ${lastError.message.slice(0, 100)}`);

      if (retry < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError || new Error('HuggingFace image generation failed');
}

// ═══════════════════════════════════════════════════════════════════════
// AUTOMATIC SPEECH RECOGNITION (ASR)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Transcribe audio using HuggingFace Inference API (Whisper).
 *
 * Endpoint: POST https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3
 * Body: Raw audio binary
 * Response: { text: "transcription", chunks: [...] }
 */
export async function transcribeAudio(request: HFASRRequest): Promise<HFASRResponse> {
  const {
    audioData,
    model = 'openai/whisper-large-v3',
    language,
  } = request;

  const url = `${HF_INFERENCE_BASE}/${model}`;

  traceImage(`[HuggingFace] ASR: model=${model}, audioSize=${(audioData.byteLength / 1024).toFixed(1)}KB`);

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const headers: Record<string, string> = {};
    if (HF_API_TOKEN) {
      headers['Authorization'] = `Bearer ${HF_API_TOKEN}`;
    }

    // Build query params
    const params = new URLSearchParams();
    if (language) params.set('language', language);
    const queryString = params.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    const response = await fetch(fullUrl, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: audioData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HuggingFace ASR error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();

    traceImage(`[HuggingFace] ASR success: model=${model}`);

    return {
      text: result.text || '',
      model,
      chunks: result.chunks,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TRANSLATION (NLLB-200)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Translate text using HuggingFace Inference API (NLLB-200).
 *
 * Endpoint: POST https://router.huggingface.co/hf-inference/models/facebook/nllb-200-distilled-600M
 * Body: { "inputs": "text", "parameters": { "src_lang": "en", "tgt_lang": "ar" } }
 * Response: [{ translation_text: "translated text" }]
 */
export async function translateText(request: HFTranslationRequest): Promise<HFTranslationResponse> {
  const {
    text,
    model = 'facebook/nllb-200-distilled-600M',
    sourceLanguage,
    targetLanguage,
  } = request;

  const url = `${HF_INFERENCE_BASE}/${model}`;

  traceImage(`[HuggingFace] Translation: model=${model}, ${sourceLanguage} → ${targetLanguage}`);

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        inputs: text,
        parameters: {
          src_lang: sourceLanguage,
          tgt_lang: targetLanguage,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HuggingFace translation error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();

    // NLLB returns an array: [{ translation_text: "..." }]
    const translationText = Array.isArray(result)
      ? result[0]?.translation_text || ''
      : result.translation_text || '';

    traceImage(`[HuggingFace] Translation success: model=${model}`);

    return {
      translationText,
      model,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SUMMARIZATION (BART Large CNN)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Summarize text using HuggingFace Inference API (BART Large CNN).
 *
 * Endpoint: POST https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn
 * Body: { "inputs": "text to summarize", "parameters": { "min_length": 30, "max_length": 200 } }
 * Response: [{ summary_text: "summary" }]
 */
export async function summarizeText(request: HFSummarizationRequest): Promise<HFSummarizationResponse> {
  const {
    text,
    model = 'facebook/bart-large-cnn',
    minLength = 30,
    maxLength = 200,
  } = request;

  const url = `${HF_INFERENCE_BASE}/${model}`;

  traceImage(`[HuggingFace] Summarization: model=${model}, inputLength=${text.length}`);

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getHFHeaders(),
      body: JSON.stringify({
        inputs: text,
        parameters: {
          min_length: minLength,
          max_length: maxLength,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HuggingFace summarization error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();

    // BART returns an array: [{ summary_text: "..." }]
    const summaryText = Array.isArray(result)
      ? result[0]?.summary_text || ''
      : result.summary_text || '';

    traceImage(`[HuggingFace] Summarization success: model=${model}`);

    return {
      summaryText,
      model,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL STATUS CHECK
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check the status of all HuggingFace models.
 * Returns a map of model ID → boolean (available or not).
 *
 * @deprecated Use verifyAllModels() for more detailed status reporting.
 */
export async function checkAllModelsStatus(): Promise<Record<string, boolean>> {
  const allModels = [
    ...Object.values(HF_CHAT_MODEL_MAP).map(m => m.hfModel),
    ...Object.values(HF_IMAGE_MODEL_MAP).map(m => m.hfModel),
  ];

  const results: Record<string, boolean> = {};

  // Check models in parallel (but limit concurrency to 3)
  const batchSize = 3;
  for (let i = 0; i < allModels.length; i += batchSize) {
    const batch = allModels.slice(i, i + batchSize);
    const checks = await Promise.allSettled(
      batch.map(async (modelId) => {
        const available = await isModelAvailable(modelId);
        return { modelId, available };
      })
    );

    for (const check of checks) {
      if (check.status === 'fulfilled') {
        results[check.value.modelId] = check.value.available;
      } else {
        results[batch[checks.indexOf(check)]] = false;
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// VERIFY ALL MODELS — Comprehensive Model Availability Check
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify ALL registered HuggingFace models by sending a tiny request to each
 * and recording whether it responds successfully. Returns a detailed report
 * with model ID, category, status (available/loading/failed), and response time.
 *
 * For chat models, uses the OpenAI-compatible /v1/chat/completions endpoint.
 * For image/ASR/translation/summarization models, uses the /hf-inference/models endpoint.
 *
 * Models are tested in batches of 3 to avoid rate limiting.
 */
export async function verifyAllModels(): Promise<HFVerificationReport> {
  const allEntries: Array<{ frontendKey: string; entry: HFModelMappingEntry }> = [];

  // Collect all model entries
  for (const [key, entry] of Object.entries(HF_ALL_MODEL_MAP)) {
    allEntries.push({ frontendKey: key, entry });
  }

  const results: HFModelVerificationResult[] = [];
  const batchSize = 3;

  for (let i = 0; i < allEntries.length; i += batchSize) {
    const batch = allEntries.slice(i, i + batchSize);
    const checks = await Promise.allSettled(
      batch.map(async ({ frontendKey, entry }) => {
        const startTime = Date.now();

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

          let response: Response;

          if (entry.category === 'chat') {
            // Chat models: use OpenAI-compatible endpoint with a minimal message
            response = await fetch(`${HF_ROUTER_V1_BASE}/chat/completions`, {
              method: 'POST',
              signal: controller.signal,
              headers: getHFHeaders(),
              body: JSON.stringify({
                model: entry.hfModel,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1,
                stream: false,
              }),
            });
          } else if (entry.category === 'image') {
            // Image models: use inference endpoint with a tiny request
            response = await fetch(`${HF_INFERENCE_BASE}/${entry.hfModel}`, {
              method: 'POST',
              signal: controller.signal,
              headers: getHFHeaders(),
              body: JSON.stringify({
                inputs: 'test',
                parameters: { width: 64, height: 64 },
              }),
            });
          } else if (entry.category === 'asr') {
            // ASR models: use inference endpoint (will fail without real audio, but shows if model is available)
            response = await fetch(`${HF_INFERENCE_BASE}/${entry.hfModel}`, {
              method: 'POST',
              signal: controller.signal,
              headers: HF_API_TOKEN ? { 'Authorization': `Bearer ${HF_API_TOKEN}` } : {},
              body: JSON.stringify({ inputs: 'test' }),
            });
          } else if (entry.category === 'translation') {
            // Translation models: use inference endpoint
            response = await fetch(`${HF_INFERENCE_BASE}/${entry.hfModel}`, {
              method: 'POST',
              signal: controller.signal,
              headers: getHFHeaders(),
              body: JSON.stringify({
                inputs: 'hello',
                parameters: { src_lang: 'eng_Latn', tgt_lang: 'arb_Arab' },
              }),
            });
          } else if (entry.category === 'summarization') {
            // Summarization models: use inference endpoint
            response = await fetch(`${HF_INFERENCE_BASE}/${entry.hfModel}`, {
              method: 'POST',
              signal: controller.signal,
              headers: getHFHeaders(),
              body: JSON.stringify({
                inputs: 'This is a test text for summarization.',
                parameters: { min_length: 1, max_length: 10 },
              }),
            });
          } else {
            // Generic fallback
            response = await fetch(`${HF_INFERENCE_BASE}/${entry.hfModel}`, {
              method: 'POST',
              signal: controller.signal,
              headers: getHFHeaders(),
              body: JSON.stringify({ inputs: 'test' }),
            });
          }

          if (timeoutId) clearTimeout(timeoutId);
          const responseTimeMs = Date.now() - startTime;

          // Determine status
          if (response.status === 503) {
            const data = await response.json().catch(() => ({}));
            if (data.error?.includes('loading') || data.error?.includes('currently loading')) {
              return {
                modelId: entry.hfModel,
                frontendKey,
                category: entry.category,
                status: 'loading' as HFModelStatus,
                responseTimeMs,
              };
            }
            return {
              modelId: entry.hfModel,
              frontendKey,
              category: entry.category,
              status: 'failed' as HFModelStatus,
              responseTimeMs,
              error: `HTTP 503: ${JSON.stringify(data).slice(0, 100)}`,
            };
          }

          if (response.status >= 500) {
            const errorText = await response.text().catch(() => '');
            return {
              modelId: entry.hfModel,
              frontendKey,
              category: entry.category,
              status: 'failed' as HFModelStatus,
              responseTimeMs,
              error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
            };
          }

          // Any 2xx or 4xx (except 429) means the model endpoint exists
          if (response.status === 429) {
            // Rate limited — model IS available, just throttled
            return {
              modelId: entry.hfModel,
              frontendKey,
              category: entry.category,
              status: 'available' as HFModelStatus,
              responseTimeMs,
            };
          }

          return {
            modelId: entry.hfModel,
            frontendKey,
            category: entry.category,
            status: 'available' as HFModelStatus,
            responseTimeMs,
          };
        } catch (err: unknown) {
          const responseTimeMs = Date.now() - startTime;
          const errorMessage = err instanceof Error ? err.message : String(err);

          // AbortError means timeout
          if (err instanceof Error && err.name === 'AbortError') {
            return {
              modelId: entry.hfModel,
              frontendKey,
              category: entry.category,
              status: 'loading' as HFModelStatus,
              responseTimeMs,
              error: 'Timeout (model may be loading)',
            };
          }

          return {
            modelId: entry.hfModel,
            frontendKey,
            category: entry.category,
            status: 'failed' as HFModelStatus,
            responseTimeMs,
            error: errorMessage.slice(0, 150),
          };
        }
      })
    );

    for (const check of checks) {
      if (check.status === 'fulfilled') {
        results.push(check.value);
      } else {
        // This shouldn't happen since we catch errors inside, but just in case
        const batchItem = batch[checks.indexOf(check)];
        results.push({
          modelId: batchItem.entry.hfModel,
          frontendKey: batchItem.frontendKey,
          category: batchItem.entry.category,
          status: 'failed',
          responseTimeMs: 0,
          error: 'Unknown error',
        });
      }
    }
  }

  // Build the report
  const available = results.filter(r => r.status === 'available').length;
  const loading = results.filter(r => r.status === 'loading').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return {
    timestamp: new Date().toISOString(),
    totalModels: results.length,
    available,
    loading,
    failed,
    results,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS — Get Available Models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get all available HuggingFace chat models as an array.
 */
export function getAvailableHFChatModels(): HFModelMappingEntry[] {
  return Object.values(HF_CHAT_MODEL_MAP);
}

/**
 * Get all available HuggingFace image models as an array.
 */
export function getAvailableHFImageModels(): HFModelMappingEntry[] {
  return Object.values(HF_IMAGE_MODEL_MAP);
}

/**
 * Get all available HuggingFace ASR models as an array.
 */
export function getAvailableHFASRModels(): HFModelMappingEntry[] {
  return Object.values(HF_ASR_MODEL_MAP);
}

/**
 * Get all available HuggingFace translation models as an array.
 */
export function getAvailableHFTranslationModels(): HFModelMappingEntry[] {
  return Object.values(HF_TRANSLATION_MODEL_MAP);
}

/**
 * Get all available HuggingFace summarization models as an array.
 */
export function getAvailableHFSummarizationModels(): HFModelMappingEntry[] {
  return Object.values(HF_SUMMARIZATION_MODEL_MAP);
}

/**
 * Get ALL HuggingFace models across all categories as an array.
 */
export function getAllHFModels(): HFModelMappingEntry[] {
  return Object.values(HF_ALL_MODEL_MAP);
}
