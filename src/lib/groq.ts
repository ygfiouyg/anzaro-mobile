// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Groq AI Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides ultra-fast AI access via Groq API (OpenAI-compatible):
//   - Chat/text generation (streaming + non-streaming)
//   - Access to LLaMA, Mixtral, Gemma models at extreme speed
//   - LPU inference engine delivers ~500-800 tokens/second
//
// Key advantage: Groq is the FASTEST inference provider available.
// LLaMA 3.3 70B runs at ~300 T/s, LLaMA 3.1 8B at ~800 T/s.
// This makes it ideal for the "Delta Flash" model and any speed-critical use.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceError, traceAPI } from '@/lib/trace-logger';

// ─── API Key ────────────────────────────────────────────────────────────
export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// ─── API Base URL ──────────────────────────────────────────────────────
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

// ─── Default Timeouts ──────────────────────────────────────────────────
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const STREAM_TIMEOUT_MS = 300_000; // 5 min — streaming code gen can take time

// ─── Default Retry Config ──────────────────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── Groq Model IDs ──────────────────────────────────────────────────

export type GroqModelId =
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant'
  | 'llama-3.2-1b-preview'
  | 'llama-3.2-3b-preview'
  | 'mixtral-8x7b-32768'
  | 'gemma2-9b-it'
  | 'deepseek-r1-distill-llama-70b';

// ─── Chat Types (OpenAI-compatible) ────────────────────────────────────

export interface GroqChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: GroqModelId;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface GroqChatResponse {
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

export interface GroqChatStreamChunk {
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

export interface GroqModelMappingEntry {
  /** Groq model ID to use */
  groqModel: GroqModelId;
  /** Human-readable label */
  label: string;
  /** Description of the model's strengths */
  description: string;
  /** Approximate tokens/second for this model on Groq */
  speedTps: number;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → Groq models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chat model mapping: DeltaAI frontend model IDs → Groq models.
 *
 * Available Groq models (as of 2025):
 *   llama-3.3-70b-versatile    — Most capable, versatile (best for complex tasks)
 *   llama-3.1-8b-instant       — Ultra-fast, lightweight (best for quick answers)
 *   llama-3.2-1b-preview       — Tiny, blazing fast
 *   llama-3.2-3b-preview       — Small, very fast
 *   mixtral-8x7b-32768         — Mixtral with 32K context (good for long docs)
 *   gemma2-9b-it               — Google Gemma 2, balanced quality
 *   deepseek-r1-distill-llama-70b — DeepSeek R1 reasoning, distilled
 *
 * STRATEGY: Use Groq for speed-critical models (Delta Flash) and as a
 * fast fallback. Map smart/pro models to LLaMA 3.3 70B for quality,
 * fast models to LLaMA 3.1 8B for speed, and specialized models to
 * the most appropriate Groq model.
 */
export const GROQ_CHAT_MODEL_MAP: Record<string, GroqModelMappingEntry> = {
  // ─── Global models ───
  'gpt-4o': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Versatile and capable, similar to GPT-4o quality',
    speedTps: 300,
  },
  'gemini-2': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Deep reasoning and comprehensive answers',
    speedTps: 300,
  },
  'claude-3-5': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Nuanced and careful reasoning',
    speedTps: 300,
  },
  'llama-3': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Meta LLaMA natively — direct and practical',
    speedTps: 300,
  },
  'mistral-large': {
    groqModel: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B (Groq)',
    description: 'Mixtral with 32K context, multilingual and precise',
    speedTps: 250,
  },
  'command-r-plus': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Technical reasoning and retrieval',
    speedTps: 300,
  },

  // ─── New models ───
  'gemini-2.5-pro': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Most advanced reasoning for deep insights',
    speedTps: 300,
  },
  'gemini-2.5-flash': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Fast and smart balanced responses',
    speedTps: 300,
  },
  'deepseek-r1': {
    groqModel: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill (Groq)',
    description: 'Deep thinking and step-by-step reasoning',
    speedTps: 250,
  },
  'gemma-2': {
    groqModel: 'gemma2-9b-it',
    label: 'Gemma 2 9B (Groq)',
    description: 'Lightweight, fast and balanced',
    speedTps: 450,
  },

  // ─── Fast models (use ultra-fast 8B) ───
  'delta-flash': {
    groqModel: 'llama-3.1-8b-instant',
    label: 'LLaMA 3.1 8B Instant (Groq)',
    description: 'Ultra-fast responses at ~800 T/s',
    speedTps: 800,
  },

  // ─── Smart models (use 70B for quality) ───
  'delta-ultra': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Most advanced reasoning for deep insights',
    speedTps: 300,
  },
  'delta-pro': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Professional-grade quality with depth',
    speedTps: 300,
  },
  'delta-philosopher': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Deep philosophical reasoning',
    speedTps: 300,
  },
  'delta-historian': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Historical accuracy and contextual analysis',
    speedTps: 300,
  },
  'delta-mathematician': {
    groqModel: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill (Groq)',
    description: 'Step-by-step mathematical reasoning',
    speedTps: 250,
  },
  'delta-strategist': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Strategic analysis and multi-step planning',
    speedTps: 300,
  },

  // ─── Creative models (use mixtral for variety) ───
  'delta-creative': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Creative and imaginative responses',
    speedTps: 300,
  },
  'delta-poet': {
    groqModel: 'gemma2-9b-it',
    label: 'Gemma 2 9B (Groq)',
    description: 'Lyrical and poetic expression',
    speedTps: 450,
  },
  'delta-comedian': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Witty and humorous responses',
    speedTps: 300,
  },
  'delta-artist': {
    groqModel: 'gemma2-9b-it',
    label: 'Gemma 2 9B (Groq)',
    description: 'Visual creativity and art analysis',
    speedTps: 450,
  },
  'delta-musician': {
    groqModel: 'gemma2-9b-it',
    label: 'Gemma 2 9B (Groq)',
    description: 'Musical theory and composition',
    speedTps: 450,
  },

  // ─── Specialized models ───
  'delta-vision': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Advanced visual analysis and description',
    speedTps: 300,
  },
  'delta-code': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Code generation and technical analysis',
    speedTps: 300,
  },
  'delta-islamic': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Islamic studies with scholarly depth',
    speedTps: 300,
  },
  'delta-egyptian': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Egyptian culture and history',
    speedTps: 300,
  },
  'delta-analyst': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Data analysis and pattern recognition',
    speedTps: 300,
  },
  'delta-teacher': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Clear explanations and educational guidance',
    speedTps: 300,
  },
  'delta-motivator': {
    groqModel: 'llama-3.1-8b-instant',
    label: 'LLaMA 3.1 8B Instant (Groq)',
    description: 'Inspiring and encouraging quick responses',
    speedTps: 800,
  },
  'delta-linguist': {
    groqModel: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B (Groq)',
    description: 'Translation and linguistic analysis with long context',
    speedTps: 250,
  },
  'delta-diplomat': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Tactful and balanced communication',
    speedTps: 300,
  },
  'delta-guardian': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Safety-focused and responsible guidance',
    speedTps: 300,
  },

  // ─── Professional models ───
  'delta-research': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Research-grade depth and accuracy',
    speedTps: 300,
  },
  'delta-doctor': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Medical knowledge and clinical analysis',
    speedTps: 300,
  },
  'delta-psychology': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Psychological insight and analysis',
    speedTps: 300,
  },
  'delta-personality': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Personality analysis and character insight',
    speedTps: 300,
  },
  'delta-fargh': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Islamic jurisprudence with scholarly depth',
    speedTps: 300,
  },
  'delta-pharmacy': {
    groqModel: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill (Groq)',
    description: 'Pharmaceutical and molecular analysis',
    speedTps: 250,
  },
  'delta-law': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Legal reasoning and formal analysis',
    speedTps: 300,
  },
  'delta-engineering': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Engineering and technical problem-solving',
    speedTps: 300,
  },
  'delta-business': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Business analysis and corporate strategy',
    speedTps: 300,
  },
  'delta-translation': {
    groqModel: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B (Groq)',
    description: 'High-quality multilingual translation with 32K context',
    speedTps: 250,
  },
  'delta-history': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Historical narrative and analysis',
    speedTps: 300,
  },
  'delta-art': {
    groqModel: 'gemma2-9b-it',
    label: 'Gemma 2 9B (Groq)',
    description: 'Art analysis and creative insight',
    speedTps: 450,
  },
  'delta-cybersecurity': {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Cybersecurity analysis and threat assessment',
    speedTps: 300,
  },
  'delta-skills': {
    groqModel: 'llama-3.1-8b-instant',
    label: 'LLaMA 3.1 8B Instant (Groq)',
    description: 'Practical skills and tutorial guidance',
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
  return `groq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the standard headers for Groq API requests.
 */
function getGroqHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Check if an error indicates content was filtered.
 */
export function isGroqContentFilterError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('content_filter') ||
      msg.includes('content policy') ||
      msg.includes('safety')
    );
  }
  return false;
}

/**
 * Check if a response was blocked by content filters.
 */
function isResponseFiltered(response: GroqChatResponse): boolean {
  if (!response.choices || response.choices.length === 0) return true;
  const choice = response.choices[0];
  return choice.finish_reason === 'content_filter';
}

/**
 * Extract text from a Groq response.
 */
function extractTextFromResponse(response: GroqChatResponse): string {
  if (!response.choices || response.choices.length === 0) return '';
  return response.choices[0].message?.content || '';
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the Groq model mapping for a given DeltaAI frontend model ID.
 * Returns a default mapping (LLaMA 3.3 70B) if the model is not found.
 */
export function getGroqChatModelMapping(modelId?: string): GroqModelMappingEntry {
  if (modelId && GROQ_CHAT_MODEL_MAP[modelId]) {
    return GROQ_CHAT_MODEL_MAP[modelId];
  }
  // Default to LLaMA 3.3 70B for unknown models
  return {
    groqModel: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B (Groq)',
    description: 'Default capable model',
    speedTps: 300,
  };
}

/**
 * Check if a given model ID has a Groq mapping.
 */
export function isGroqChatModel(modelId: string): boolean {
  return modelId in GROQ_CHAT_MODEL_MAP;
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Non-Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a chat completion using Groq API.
 *
 * Endpoint: POST /openai/v1/chat/completions
 * Format: OpenAI-compatible (same request/response shape)
 */
export async function generateGroqChat(
  request: GroqChatRequest
): Promise<GroqChatResponse> {
  const {
    messages,
    model = 'llama-3.3-70b-versatile',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  const url = `${GROQ_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[Groq] Chat completion: model=${model}, messages=${messages.length}`);

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: getGroqHeaders(),
        body: JSON.stringify(body),
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errMsg = errorText.slice(0, 300);

        // Handle rate limiting
        if (response.status === 429) {
          traceError(`[Groq] Rate limited (429), retry ${retry + 1}/${MAX_RETRIES}`);
          if (retry < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (retry + 1));
            continue;
          }
        }

        // Handle server errors with retry
        if (response.status >= 500 && retry < MAX_RETRIES) {
          traceError(`[Groq] Server error ${response.status}, retry ${retry + 1}/${MAX_RETRIES}`);
          await sleep(RETRY_DELAY_MS * (retry + 1));
          continue;
        }

        throw new Error(`Groq API error ${response.status}: ${errMsg}`);
      }

      const result = (await response.json()) as GroqChatResponse;

      // Check if response was blocked by content filters
      if (isResponseFiltered(result)) {
        traceError(`[Groq] Response blocked by content filters`);
        throw new Error('Groq response blocked by content filters');
      }

      const text = extractTextFromResponse(result);
      traceAPI(`[Groq] Chat completion success: model=${model}, tokens=${result.usage?.total_tokens ?? 'unknown'}, text_len=${text.length}`);

      return { ...result, id: result.id || generateId() };
    } catch (chatError) {
      lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
      traceAPI(`[Groq] Chat attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isGroqContentFilterError(chatError)) break;
      if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[Groq] Chat completion failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('Groq chat completion failed');
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a streaming chat completion using Groq API.
 * Returns an async generator that yields OpenAI-compatible SSE chunks.
 *
 * Endpoint: POST /openai/v1/chat/completions with stream: true
 *
 * Groq returns SSE events identical to OpenAI:
 *   data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
export async function* streamGroqChat(
  request: GroqChatRequest
): AsyncGenerator<GroqChatStreamChunk, void, unknown> {
  const {
    messages,
    model = 'llama-3.3-70b-versatile',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  const url = `${GROQ_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[Groq] Streaming chat: model=${model}, messages=${messages.length}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getGroqHeaders(),
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    traceError(`[Groq] Streaming fetch failed: ${errMsg.slice(0, 100)}`);
    throw fetchError;
  }

  if (!response.ok) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorText = await response.text().catch(() => '');
    traceError(`[Groq] Streaming chat error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(`Groq streaming error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const resBody = response.body as ReadableStream<Uint8Array> | null;
  if (!resBody) {
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error('No response body for Groq streaming');
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
          const chunk = JSON.parse(dataStr) as GroqChatStreamChunk;

          // Check if chunk was blocked by content filter
          if (
            chunk.choices &&
            chunk.choices.length > 0 &&
            chunk.choices[0].finish_reason === 'content_filter'
          ) {
            traceError(`[Groq] Streaming response blocked by content filters`);
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

    traceAPI(`[Groq] Streaming chat complete: model=${model}, text_len=${totalText.length}`);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    reader.releaseLock();
  }
}
