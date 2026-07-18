// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Cerebras AI Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides ultra-fast FREE AI access via Cerebras API (OpenAI-compatible):
//   - Chat/text generation (streaming + non-streaming)
//   - Access to LLaMA 3.3 70B, LLaMA 3.1 8B, Qwen 2.5 32B
//   - CS-3 wafer-scale engine delivers ~20x GPU speed
//
// Key advantage: Cerebras is FREE — 1M tokens/day, NO API KEY NEEDED!
// Optional free API key at cerebras.ai for higher rate limits.
// LLaMA 3.3 70B runs at extreme speed, ideal for quality-critical tasks.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceError, traceAPI } from '@/lib/trace-logger';

// ─── API Key (optional — free tier works without one) ──────────────────
export const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';

// ─── API Base URL ──────────────────────────────────────────────────────
const CEREBRAS_API_BASE = 'https://api.cerebras.ai/v1';

// ─── Default Timeouts ──────────────────────────────────────────────────
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const STREAM_TIMEOUT_MS = 300_000; // 5 min — streaming code gen can take time

// ─── Default Retry Config ──────────────────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── Cerebras Model IDs ──────────────────────────────────────────────

export type CerebrasModelId =
  | 'llama-3.3-70b'
  | 'llama-3.1-8b'
  | 'qwen-2.5-32b';

// ─── Chat Types (OpenAI-compatible) ────────────────────────────────────

export interface CerebrasChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: CerebrasModelId;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  /** Optional AbortSignal to cancel the request (fixes stream leak on timeout) */
  signal?: AbortSignal;
}

export interface CerebrasChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface CerebrasChatStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

// ─── Model Mapping Types ───────────────────────────────────────────────

export interface CerebrasModelMappingEntry {
  /** Cerebras model ID to use */
  cerebrasModel: CerebrasModelId;
  /** Human-readable label */
  label: string;
  /** Description of the model's strengths */
  description: string;
  /** Approximate tokens/second for this model on Cerebras */
  speedTps: number;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → Cerebras models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chat model mapping: DeltaAI frontend model IDs → Cerebras models.
 *
 * Available Cerebras models (as of 2025):
 *   llama-3.3-70b     — Most capable, 70B params (best for smart/professional tasks)
 *   llama-3.1-8b      — Ultra-fast, 8B params (best for quick answers, flash model)
 *   qwen-2.5-32b      — Qwen 2.5, 32B params (best for code, multilingual, creative)
 *
 * STRATEGY:
 *   - llama-3.3-70b  → Smart models, Professional models, Global models (quality)
 *   - llama-3.1-8b   → Fast models, lightweight tasks (speed)
 *   - qwen-2.5-32b   → Code, Creative, Specialized models (multilingual, coding)
 *
 * All models run on Cerebras CS-3 wafer-scale engine at ~20x GPU speed.
 * FREE tier: 1M tokens/day, no API key needed.
 */
export const CEREBRAS_CHAT_MODEL_MAP: Record<string, CerebrasModelMappingEntry> = {
  // ─── Global models (quality → llama-3.3-70b) ───
  'gpt-4o': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Versatile and capable, similar to GPT-4o quality at 20x GPU speed',
    speedTps: 500,
  },
  'gemini-2': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Deep reasoning and comprehensive answers',
    speedTps: 500,
  },
  'claude-3-5': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Nuanced and careful reasoning',
    speedTps: 500,
  },
  'llama-3': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Meta LLaMA natively — direct and practical',
    speedTps: 500,
  },
  'mistral-large': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Multilingual and precise reasoning',
    speedTps: 500,
  },
  'command-r-plus': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Technical reasoning and retrieval-augmented generation',
    speedTps: 500,
  },

  // ─── Fast models (use ultra-fast 8B) ───
  'delta-flash': {
    cerebrasModel: 'llama-3.1-8b',
    label: 'LLaMA 3.1 8B (Cerebras)',
    description: 'Ultra-fast responses at extreme speed',
    speedTps: 2000,
  },

  // ─── Smart models (use 70B for quality) ───
  'delta-ultra': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Most advanced reasoning for deep insights',
    speedTps: 500,
  },
  'delta-pro': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Professional-grade quality with depth',
    speedTps: 500,
  },
  'delta-philosopher': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Deep philosophical reasoning',
    speedTps: 500,
  },
  'delta-historian': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Historical accuracy and contextual analysis',
    speedTps: 500,
  },
  'delta-mathematician': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Step-by-step mathematical reasoning',
    speedTps: 500,
  },
  'delta-strategist': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Strategic analysis and multi-step planning',
    speedTps: 500,
  },

  // ─── Creative models (use qwen-2.5-32b for multilingual/creative) ───
  'delta-creative': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Creative and imaginative responses with multilingual flair',
    speedTps: 800,
  },
  'delta-poet': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Lyrical and poetic expression, excellent for Arabic poetry',
    speedTps: 800,
  },
  'delta-comedian': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Witty and humorous responses with cultural awareness',
    speedTps: 800,
  },
  'delta-artist': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Visual creativity and art analysis',
    speedTps: 800,
  },
  'delta-musician': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Musical theory and composition',
    speedTps: 800,
  },

  // ─── Specialized models ───
  'delta-vision': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Advanced visual analysis and description',
    speedTps: 500,
  },
  'delta-code': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Code generation and technical analysis — Qwen excels at coding',
    speedTps: 800,
  },
  'delta-islamic': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Islamic studies with scholarly depth',
    speedTps: 500,
  },
  'delta-egyptian': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Egyptian culture and Arabic dialect — Qwen excels at Arabic',
    speedTps: 800,
  },
  'delta-analyst': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Data analysis and pattern recognition',
    speedTps: 500,
  },
  'delta-teacher': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Clear explanations and educational guidance',
    speedTps: 500,
  },
  'delta-motivator': {
    cerebrasModel: 'llama-3.1-8b',
    label: 'LLaMA 3.1 8B (Cerebras)',
    description: 'Inspiring and encouraging quick responses',
    speedTps: 2000,
  },
  'delta-linguist': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Translation and linguistic analysis — Qwen excels at multilingual',
    speedTps: 800,
  },
  'delta-diplomat': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Tactful and balanced communication',
    speedTps: 500,
  },
  'delta-guardian': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Safety-focused and responsible guidance',
    speedTps: 500,
  },

  // ─── Professional models (use 70B for depth) ───
  'delta-research': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Research-grade depth and accuracy',
    speedTps: 500,
  },
  'delta-doctor': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Medical knowledge and clinical analysis',
    speedTps: 500,
  },
  'delta-psychology': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Psychological insight and analysis',
    speedTps: 500,
  },
  'delta-personality': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Personality analysis and character insight',
    speedTps: 500,
  },
  'delta-fargh': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Agricultural expertise with Arabic context',
    speedTps: 800,
  },
  'delta-pharmacy': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Pharmaceutical and molecular analysis',
    speedTps: 500,
  },
  'delta-law': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Legal reasoning and formal analysis',
    speedTps: 500,
  },
  'delta-engineering': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Engineering and technical problem-solving — strong at STEM',
    speedTps: 800,
  },
  'delta-business': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Business analysis and corporate strategy',
    speedTps: 500,
  },
  'delta-translation': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'High-quality multilingual translation — Qwen excels at languages',
    speedTps: 800,
  },
  'delta-history': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Historical narrative and analysis',
    speedTps: 500,
  },
  'delta-art': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Art analysis and creative insight',
    speedTps: 800,
  },
  'delta-cybersecurity': {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Cybersecurity analysis and threat assessment',
    speedTps: 500,
  },
  'delta-skills': {
    cerebrasModel: 'llama-3.1-8b',
    label: 'LLaMA 3.1 8B (Cerebras)',
    description: 'Practical skills and tutorial guidance — fast responses',
    speedTps: 2000,
  },

  // ─── HuggingFace models (mapped to Cerebras equivalents) ───
  'hf-mistral-7b': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Upgraded from Mistral 7B — multilingual and balanced',
    speedTps: 800,
  },
  'hf-llama-3-8b': {
    cerebrasModel: 'llama-3.1-8b',
    label: 'LLaMA 3.1 8B (Cerebras)',
    description: 'Direct LLaMA 3 equivalent at extreme speed',
    speedTps: 2000,
  },
  'hf-qwen2-7b': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Upgraded from Qwen2 7B — better quality at high speed',
    speedTps: 800,
  },
  'hf-phi3-mini': {
    cerebrasModel: 'llama-3.1-8b',
    label: 'LLaMA 3.1 8B (Cerebras)',
    description: 'Small model replacement — fast and capable',
    speedTps: 2000,
  },
  'hf-zephyr-7b': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Upgraded from Zephyr 7B — instruction-following excellence',
    speedTps: 800,
  },
  'hf-openhermes': {
    cerebrasModel: 'qwen-2.5-32b',
    label: 'Qwen 2.5 32B (Cerebras)',
    description: 'Upgraded from OpenHermes — creative and conversational',
    speedTps: 800,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique ID for response tracking.
 */
function generateId(): string {
  return `cerebras_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the standard headers for Cerebras API requests.
 * API key is optional — free tier works without one.
 */
function getCerebrasHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (CEREBRAS_API_KEY) {
    headers['Authorization'] = `Bearer ${CEREBRAS_API_KEY}`;
  }
  return headers;
}

/**
 * Check if an error indicates content was filtered.
 */
export function isCerebrasContentFilterError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('content_filter') ||
      msg.includes('content policy') ||
      msg.includes('safety') ||
      msg.includes('content management policy')
    );
  }
  return false;
}

/**
 * Check if a response was blocked by content filters.
 */
function isResponseFiltered(response: CerebrasChatResponse): boolean {
  if (!response.choices || response.choices.length === 0) return true;
  const choice = response.choices[0];
  return choice.finish_reason === 'content_filter';
}

/**
 * Extract text from a Cerebras response.
 */
function extractTextFromResponse(response: CerebrasChatResponse): string {
  if (!response.choices || response.choices.length === 0) return '';
  return response.choices[0].message?.content || '';
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the Cerebras model mapping for a given DeltaAI frontend model ID.
 * Returns a default mapping (LLaMA 3.3 70B) if the model is not found.
 */
export function getCerebrasChatModelMapping(modelId?: string): CerebrasModelMappingEntry {
  if (modelId && CEREBRAS_CHAT_MODEL_MAP[modelId]) {
    return CEREBRAS_CHAT_MODEL_MAP[modelId];
  }
  // Default to LLaMA 3.3 70B for unknown models
  return {
    cerebrasModel: 'llama-3.3-70b',
    label: 'LLaMA 3.3 70B (Cerebras)',
    description: 'Default capable model',
    speedTps: 500,
  };
}

/**
 * Check if a given model ID has a Cerebras mapping.
 */
export function isCerebrasChatModel(modelId: string): boolean {
  return modelId in CEREBRAS_CHAT_MODEL_MAP;
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Non-Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a chat completion using Cerebras API.
 *
 * Endpoint: POST /v1/chat/completions
 * Format: OpenAI-compatible (same request/response shape)
 *
 * NO API KEY NEEDED for free tier (1M tokens/day).
 */
export async function generateCerebrasChat(
  request: CerebrasChatRequest
): Promise<CerebrasChatResponse> {
  const {
    messages,
    model = 'llama-3.3-70b',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  const url = `${CEREBRAS_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[Cerebras] Chat completion: model=${model}, messages=${messages.length}`);

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: getCerebrasHeaders(),
        body: JSON.stringify(body),
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errMsg = errorText.slice(0, 300);

        // Handle rate limiting
        if (response.status === 429) {
          traceError(`[Cerebras] Rate limited (429), retry ${retry + 1}/${MAX_RETRIES}`);
          if (retry < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (retry + 1));
            continue;
          }
        }

        // Handle server errors with retry
        if (response.status >= 500 && retry < MAX_RETRIES) {
          traceError(`[Cerebras] Server error ${response.status}, retry ${retry + 1}/${MAX_RETRIES}`);
          await sleep(RETRY_DELAY_MS * (retry + 1));
          continue;
        }

        throw new Error(`Cerebras API error ${response.status}: ${errMsg}`);
      }

      const result = (await response.json()) as CerebrasChatResponse;

      // Check if response was blocked by content filters
      if (isResponseFiltered(result)) {
        traceError(`[Cerebras] Response blocked by content filters`);
        throw new Error('Cerebras response blocked by content filters');
      }

      const text = extractTextFromResponse(result);
      traceAPI(`[Cerebras] Chat completion success: model=${model}, tokens=${result.usage?.total_tokens ?? 'unknown'}, text_len=${text.length}`);

      return { ...result, id: result.id || generateId() };
    } catch (chatError) {
      lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
      traceAPI(`[Cerebras] Chat attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isCerebrasContentFilterError(chatError)) break;
      if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[Cerebras] Chat completion failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('Cerebras chat completion failed');
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a streaming chat completion using Cerebras API.
 * Returns an async generator that yields OpenAI-compatible SSE chunks.
 *
 * Endpoint: POST /v1/chat/completions with stream: true
 *
 * Cerebras returns SSE events identical to OpenAI:
 *   data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 *
 * NO API KEY NEEDED for free tier (1M tokens/day).
 */
export async function* streamCerebrasChat(
  request: CerebrasChatRequest
): AsyncGenerator<CerebrasChatStreamChunk, void, unknown> {
  const {
    messages,
    model = 'llama-3.3-70b',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
    signal: externalSignal,
  } = request;

  const url = `${CEREBRAS_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[Cerebras] Streaming chat: model=${model}, messages=${messages.length}`);

  // FIX #5: Use external AbortSignal if provided, otherwise create our own timeout
  // This allows the caller to abort the stream (e.g., on first-token timeout)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  // If an external signal is provided, forward its abort to our controller
  if (externalSignal) {
    if (externalSignal.aborted) {
      if (timeoutId) clearTimeout(timeoutId);
      throw new Error('Cerebras request aborted before start');
    }
    externalSignal.addEventListener('abort', () => {
      controller.abort();
      if (timeoutId) clearTimeout(timeoutId);
    }, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getCerebrasHeaders(),
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    traceError(`[Cerebras] Streaming fetch failed: ${errMsg.slice(0, 100)}`);
    throw fetchError;
  }

  if (!response.ok) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorText = await response.text().catch(() => '');
    traceError(`[Cerebras] Streaming chat error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(`Cerebras streaming error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const resBody = response.body as ReadableStream<Uint8Array> | null;
  if (!resBody) {
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error('No response body for Cerebras streaming');
  }

  const reader = resBody.getReader();
  const decoder = new TextDecoder();

  try {
    let buffer = '';
    let totalText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(dataStr) as CerebrasChatStreamChunk;

          // Check if chunk was blocked by content filter
          if (
            chunk.choices &&
            chunk.choices.length > 0 &&
            chunk.choices[0].finish_reason === 'content_filter'
          ) {
            traceError(`[Cerebras] Streaming response blocked by content filters`);
            return;
          }

          // Extract text for logging
          if (chunk.choices?.[0]?.delta?.content) {
            totalText += chunk.choices[0].delta.content;
          }

          yield chunk;
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }

    traceAPI(`[Cerebras] Streaming chat complete: model=${model}, text_len=${totalText.length}`);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    reader.releaseLock();
  }
}
