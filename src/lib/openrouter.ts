// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — OpenRouter AI Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides AI access via OpenRouter API (OpenAI-compatible):
//   - Chat/text generation (streaming + non-streaming)
//   - Access to 100+ models through a single unified API
//   - Supports both free and paid models
//
// Key advantage: OpenRouter provides access to diverse models (Qwen, Grok,
// GPT, Kimi, Nemotron, etc.) with a single API key, and includes free
// models that work from regions where other APIs may be blocked.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceImage, traceError, traceAPI } from '@/lib/trace-logger';

// ─── API Key ────────────────────────────────────────────────────────────
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// ─── API Base URL ──────────────────────────────────────────────────────
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

// ─── Default Timeouts ──────────────────────────────────────────────────
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const VISION_TIMEOUT_MS = 180_000; // 3 min — vision analysis

// ─── Default Retry Config ──────────────────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── OpenRouter Model IDs ─────────────────────────────────────────────

export type OpenRouterModelId =
  | 'openai/gpt-oss-120b:free'
  | 'openai/gpt-4o'
  | 'nvidia/nemotron-3-super-120b-a12b:free'
  | 'nvidia/nemotron-3-nano-30b-a3b:free'
  | 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
  | 'z-ai/glm-4.5-air:free'
  | 'openrouter/owl-alpha'
  | 'moonshotai/kimi-k2.6:free'
  | 'meta-llama/llama-3.3-70b-instruct:free'
  | 'nousresearch/hermes-3-llama-3.1-405b:free'
  | 'qwen/qwen3-coder:free'
  | 'qwen/qwen3.6-flash'
  | 'qwen/qwen3.6-max-preview';

// ─── Chat Types ────────────────────────────────────────────────────────

export interface OpenRouterChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: OpenRouterModelId;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  /** Whether to stream the response (handled by choosing stream vs generate function) */
  stream?: boolean;
}

export interface OpenRouterChatResponse {
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

export interface OpenRouterChatStreamChunk {
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

export interface OpenRouterModelMappingEntry {
  /** OpenRouter model ID to use */
  openrouterModel: OpenRouterModelId;
  /** Human-readable label */
  label: string;
  /** Description of the model's strengths */
  description: string;
  /** Whether this model is free on OpenRouter */
  isFree: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → OpenRouter models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chat model mapping: DeltaAI frontend model IDs → OpenRouter models.
 *
 * Available OpenRouter FREE models (tested 2025-06-01 from Egypt):
 *   ─── Reliably Available (✅ tested & working) ───
 *   openai/gpt-oss-120b:free                          — GPT OSS 120B ✅
 *   nvidia/nemotron-3-super-120b-a12b:free             — Nemotron 120B ✅
 *   nvidia/nemotron-3-nano-30b-a3b:free                — Nemotron Nano 30B (fast) ✅
 *   nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free — Nemotron Reasoning ✅
 *   z-ai/glm-4.5-air:free                              — GLM 4.5 Air (Arabic) ✅
 *   openrouter/owl-alpha                               — Owl Alpha ✅
 *
 *   ─── Rate-Limited (⚠️ works sometimes, 429 under load) ───
 *   moonshotai/kimi-k2.6:free               — Kimi K2.6 ⚠️
 *   meta-llama/llama-3.3-70b-instruct:free   — LLaMA 3.3 70B ⚠️
 *   nousresearch/hermes-3-llama-3.1-405b:free — Hermes 405B ⚠️
 *   qwen/qwen3-coder:free                    — Qwen Coder ⚠️
 *
 *   ─── REMOVED (❌ NOT available as free on OpenRouter) ───
 *   deepseek/deepseek-chat-v3-0324:free  → replaced by nemotron-super-120b
 *   deepseek/deepseek-r1:free            → replaced by nemotron-reasoning
 *   deepseek/deepseek-v4-flash:free      → replaced by nemotron-nano-30b
 *   minimax/minimax-m2.5:free            → replaced by glm-4.5-air
 *   google/gemma-4-31b-it:free           → region blocked (Egypt)
 *
 * STRATEGY: Map each DeltaAI frontend model ID to a reliably available
 * OpenRouter free model. Rate-limited models are used sparingly.
 */
export const OPENROUTER_CHAT_MODEL_MAP: Record<string, OpenRouterModelMappingEntry> = {
  // ═══════════════════════════════════════════════════════════════
  // GLOBAL models (6) — premium experience
  // ═══════════════════════════════════════════════════════════════
  'gpt-4o': {
    openrouterModel: 'openai/gpt-4o',
    label: 'GPT-4o (OpenRouter)',
    description: 'Real OpenAI GPT-4o via OpenRouter — most capable model',
    isFree: false,
  },
  'gemini-2': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Large capable model, Gemini-like quality',
    isFree: true,
  },
  'claude-3-5': {
    openrouterModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    label: 'Nemotron Reasoning (Free)',
    description: 'Deep reasoning like Claude, thoughtful analysis',
    isFree: true,
  },
  'command-r-plus': {
    openrouterModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron Nano 30B (Free)',
    description: 'Fast RAG-style responses, quick retrieval',
    isFree: true,
  },
  'llama-3': {
    openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'LLaMA 3.3 70B (Free)',
    description: 'Real Meta LLaMA model, open-source powerhouse',
    isFree: true,
  },
  'mistral-large': {
    openrouterModel: 'z-ai/glm-4.5-air:free',
    label: 'GLM 4.5 Air (Free)',
    description: 'Multilingual model, great for diverse languages',
    isFree: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // FAST (1)
  // ═══════════════════════════════════════════════════════════════
  'delta-flash': {
    openrouterModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron Nano 30B (Free)',
    description: 'Ultra-fast free model for quick responses',
    isFree: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SMART (6) — premium models for deep thinking
  // ═══════════════════════════════════════════════════════════════
  'delta-pro': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Professional-grade quality with depth',
    isFree: true,
  },
  'delta-ultra': {
    openrouterModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    label: 'Nemotron Reasoning (Free)',
    description: 'Most advanced reasoning for deep insights',
    isFree: true,
  },
  'delta-philosopher': {
    openrouterModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    label: 'Nemotron Reasoning (Free)',
    description: 'Deep philosophical reasoning and nuance',
    isFree: true,
  },
  'delta-historian': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Large model with vast knowledge, great for history',
    isFree: true,
  },
  'delta-mathematician': {
    openrouterModel: 'openai/gpt-oss-120b:free',
    label: 'GPT OSS 120B (Free)',
    description: 'Strong logical and mathematical reasoning',
    isFree: true,
  },
  'delta-strategist': {
    openrouterModel: 'moonshotai/kimi-k2.6:free',
    label: 'Kimi K2.6 (Free)',
    description: 'Strategic thinking and multi-step planning',
    isFree: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // CREATIVE (5) — diverse creative models
  // ═══════════════════════════════════════════════════════════════
  'delta-creative': {
    openrouterModel: 'nousresearch/hermes-3-llama-3.1-405b:free',
    label: 'Hermes 405B (Free)',
    description: 'Creative and imaginative, great instruction following',
    isFree: true,
  },
  'delta-poet': {
    openrouterModel: 'z-ai/glm-4.5-air:free',
    label: 'GLM 4.5 Air (Free)',
    description: 'Excellent Arabic poetry and literary generation',
    isFree: true,
  },
  'delta-comedian': {
    openrouterModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron Nano 30B (Free)',
    description: 'Quick-witted responses and humor',
    isFree: true,
  },
  'delta-artist': {
    openrouterModel: 'openrouter/owl-alpha',
    label: 'Owl Alpha (Free)',
    description: 'Visual description and artistic analysis',
    isFree: true,
  },
  'delta-musician': {
    openrouterModel: 'z-ai/glm-4.5-air:free',
    label: 'GLM 4.5 Air (Free)',
    description: 'Rhythmic and musical knowledge',
    isFree: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SPECIALIZED (10) — each model gets a unique backend
  // ═══════════════════════════════════════════════════════════════
  'delta-vision': {
    openrouterModel: 'openrouter/owl-alpha',
    label: 'Owl Alpha (Free)',
    description: 'Visual understanding and image analysis',
    isFree: true,
  },
  'delta-code': {
    openrouterModel: 'qwen/qwen3-coder:free',
    label: 'Qwen 3 Coder (Free)',
    description: 'Code generation and technical analysis',
    isFree: true,
  },
  'delta-islamic': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Large model for nuanced Islamic scholarship',
    isFree: true,
  },
  'delta-egyptian': {
    openrouterModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron Nano 30B (Free)',
    description: 'Fast model for Egyptian dialect chat',
    isFree: true,
  },
  'delta-analyst': {
    openrouterModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron Nano 30B (Free)',
    description: 'Data analysis and financial reasoning',
    isFree: true,
  },
  'delta-teacher': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Patient, thorough explanations',
    isFree: true,
  },
  'delta-motivator': {
    openrouterModel: 'openai/gpt-oss-120b:free',
    label: 'GPT OSS 120B (Free)',
    description: 'Inspiring and encouraging responses',
    isFree: true,
  },
  'delta-linguist': {
    openrouterModel: 'z-ai/glm-4.5-air:free',
    label: 'GLM 4.5 Air (Free)',
    description: 'Multilingual expertise, grammar analysis',
    isFree: true,
  },
  'delta-diplomat': {
    openrouterModel: 'nousresearch/hermes-3-llama-3.1-405b:free',
    label: 'Hermes 405B (Free)',
    description: 'Balanced, diplomatic responses',
    isFree: true,
  },
  'delta-guardian': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Security-focused, precise technical advice',
    isFree: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // PROFESSIONAL (14) — expertise models
  // ═══════════════════════════════════════════════════════════════
  'delta-research': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Research-grade depth and accuracy',
    isFree: true,
  },
  'delta-doctor': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Large model for medical knowledge',
    isFree: true,
  },
  'delta-psychology': {
    openrouterModel: 'openai/gpt-oss-120b:free',
    label: 'GPT OSS 120B (Free)',
    description: 'Empathetic and nuanced psychological support',
    isFree: true,
  },
  'delta-personality': {
    openrouterModel: 'moonshotai/kimi-k2.6:free',
    label: 'Kimi K2.6 (Free)',
    description: 'Personality analysis and behavioral insights',
    isFree: true,
  },
  'delta-fargh': {
    openrouterModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron Nano 30B (Free)',
    description: 'Agricultural expertise and rural knowledge',
    isFree: true,
  },
  'delta-pharmacy': {
    openrouterModel: 'z-ai/glm-4.5-air:free',
    label: 'GLM 4.5 Air (Free)',
    description: 'Pharmaceutical knowledge and drug interactions',
    isFree: true,
  },
  'delta-law': {
    openrouterModel: 'nousresearch/hermes-3-llama-3.1-405b:free',
    label: 'Hermes 405B (Free)',
    description: 'Legal reasoning and citation',
    isFree: true,
  },
  'delta-engineering': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Technical and engineering precision',
    isFree: true,
  },
  'delta-business': {
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B (Free)',
    description: 'Business strategy and market analysis',
    isFree: true,
  },
  'delta-translation': {
    openrouterModel: 'z-ai/glm-4.5-air:free',
    label: 'GLM 4.5 Air (Free)',
    description: 'Translation excellence, multilingual',
    isFree: true,
  },
  'delta-history': {
    openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'LLaMA 3.3 70B (Free)',
    description: 'Historical knowledge and narrative',
    isFree: true,
  },
  'delta-art': {
    openrouterModel: 'openrouter/owl-alpha',
    label: 'Owl Alpha (Free)',
    description: 'Art criticism and visual analysis',
    isFree: true,
  },
  'delta-cybersecurity': {
    openrouterModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    label: 'Nemotron Reasoning (Free)',
    description: 'Cybersecurity expertise and threat analysis',
    isFree: true,
  },
  'delta-skills': {
    openrouterModel: 'z-ai/glm-4.5-air:free',
    label: 'GLM 4.5 Air (Free)',
    description: 'Skills training and personal development',
    isFree: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // HUGGINGFACE (6) — free open-source alternatives
  // ═══════════════════════════════════════════════════════════════
  'hf-mistral-7b': {
    openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'LLaMA 3.3 70B (Free)',
    description: 'Open-source alternative for Mistral-style tasks',
    isFree: true,
  },
  'hf-llama-3-8b': {
    openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'LLaMA 3.3 70B (Free)',
    description: 'Upgraded LLaMA backend for HF LLaMA model',
    isFree: true,
  },
  'hf-qwen2-7b': {
    openrouterModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron Nano 30B (Free)',
    description: 'Fast model alternative for Qwen-style tasks',
    isFree: true,
  },
  'hf-phi3-mini': {
    openrouterModel: 'openrouter/owl-alpha',
    label: 'Owl Alpha (Free)',
    description: 'Lightweight but capable for Phi-style tasks',
    isFree: true,
  },
  'hf-zephyr-7b': {
    openrouterModel: 'nousresearch/hermes-3-llama-3.1-405b:free',
    label: 'Hermes 405B (Free)',
    description: 'Instruction-following alternative for Zephyr tasks',
    isFree: true,
  },
  'hf-openhermes': {
    openrouterModel: 'nousresearch/hermes-3-llama-3.1-405b:free',
    label: 'Hermes 405B (Free)',
    description: 'Hermes-family backend for OpenHermes tasks',
    isFree: true,
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
  return `or_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the standard headers for OpenRouter API requests.
 */
function getOpenRouterHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://deltaai.app',
    'X-Title': 'DeltaAI Platform',
  };
}

/**
 * Check if an error indicates content was filtered by safety settings.
 */
export function isOpenRouterContentFilterError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('content_filter') ||
      msg.includes('content policy') ||
      msg.includes('safety') ||
      (msg.includes('finish_reason') && msg.includes('content_filter'))
    );
  }
  return false;
}

/**
 * Check if a response was blocked by content filters.
 */
function isResponseFiltered(response: OpenRouterChatResponse): boolean {
  if (!response.choices || response.choices.length === 0) return true;
  const choice = response.choices[0];
  return choice.finish_reason === 'content_filter';
}

/**
 * Extract text from an OpenRouter response.
 */
function extractTextFromResponse(response: OpenRouterChatResponse): string {
  if (!response.choices || response.choices.length === 0) return '';
  return response.choices[0].message?.content || '';
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the OpenRouter model mapping for a given DeltaAI frontend model ID.
 * Returns a default mapping if the model is not found.
 */
export function getOpenRouterChatModelMapping(modelId?: string): OpenRouterModelMappingEntry {
  if (modelId && OPENROUTER_CHAT_MODEL_MAP[modelId]) {
    return OPENROUTER_CHAT_MODEL_MAP[modelId];
  }
  // Default to GPT OSS 120B (free, reliable, large) for unknown models
  return {
    openrouterModel: 'openai/gpt-oss-120b:free',
    label: 'GPT OSS 120B (Free)',
    description: 'Default capable free model',
    isFree: true,
  };
}

/**
 * Check if a given model ID is an OpenRouter model (exists in the mapping).
 */
export function isOpenRouterChatModel(modelId: string): boolean {
  return modelId in OPENROUTER_CHAT_MODEL_MAP;
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Non-Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a chat completion using OpenRouter API.
 *
 * Endpoint: POST /v1/chat/completions
 * Format: OpenAI-compatible (same request/response shape)
 */
export async function generateOpenRouterChat(
  request: OpenRouterChatRequest
): Promise<OpenRouterChatResponse> {
  const {
    messages,
    model = 'openai/gpt-oss-120b:free',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  const url = `${OPENROUTER_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[OpenRouter] Chat completion: model=${model}, messages=${messages.length}`);

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: getOpenRouterHeaders(),
        body: JSON.stringify(body),
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errMsg = errorText.slice(0, 300);

        // Handle specific error codes
        if (response.status === 429) {
          traceError(`[OpenRouter] Rate limited (429), retry ${retry + 1}/${MAX_RETRIES}`);
          if (retry < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (retry + 1)); // Exponential backoff
            continue;
          }
        }

        // Handle server errors with retry
        if (response.status >= 500 && retry < MAX_RETRIES) {
          traceError(`[OpenRouter] Server error ${response.status}, retry ${retry + 1}/${MAX_RETRIES}`);
          await sleep(RETRY_DELAY_MS * (retry + 1));
          continue;
        }

        throw new Error(`OpenRouter API error ${response.status}: ${errMsg}`);
      }

      const result = (await response.json()) as OpenRouterChatResponse;

      // Check if response was blocked by content filters
      if (isResponseFiltered(result)) {
        traceError(`[OpenRouter] Response blocked by content filters`);
        throw new Error('OpenRouter response blocked by content filters');
      }

      const text = extractTextFromResponse(result);
      traceAPI(`[OpenRouter] Chat completion success: model=${model}, tokens=${result.usage?.total_tokens ?? 'unknown'}, text_len=${text.length}`);

      return { ...result, id: result.id || generateId() };
    } catch (chatError) {
      lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
      traceAPI(`[OpenRouter] Chat attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isOpenRouterContentFilterError(chatError)) break;
      if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[OpenRouter] Chat completion failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('OpenRouter chat completion failed');
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a streaming chat completion using OpenRouter API.
 * Returns an async generator that yields OpenAI-compatible SSE chunks.
 *
 * Endpoint: POST /v1/chat/completions with stream: true
 *
 * OpenRouter returns SSE events identical to OpenAI:
 *   data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
export async function* streamOpenRouterChat(
  request: OpenRouterChatRequest
): AsyncGenerator<OpenRouterChatStreamChunk, void, unknown> {
  const {
    messages,
    model = 'openai/gpt-oss-120b:free',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  const url = `${OPENROUTER_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[OpenRouter] Streaming chat: model=${model}, messages=${messages.length}`);

  // Retry logic for rate limits and server errors
  let lastError: Error | null = null;
  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    const controller = new AbortController();
    const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: getOpenRouterHeaders(),
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      if (timeoutId) clearTimeout(timeoutId);
      const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      traceError(`[OpenRouter] Streaming fetch failed: ${errMsg.slice(0, 100)}`);
      lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      if (retry < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (retry + 1));
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      if (timeoutId) clearTimeout(timeoutId);
      const errorText = await response.text().catch(() => '');
      const errMsg = errorText.slice(0, 200);
      traceError(`[OpenRouter] Streaming chat error ${response.status}: ${errMsg}`);

      // Retry on rate limit (429) with exponential backoff
      if (response.status === 429 && retry < MAX_RETRIES) {
        traceAPI(`[OpenRouter] Rate limited (429), retry ${retry + 1}/${MAX_RETRIES}`);
        await sleep(RETRY_DELAY_MS * (retry + 1) * 2); // Longer backoff for rate limits
        continue;
      }

      // Retry on server errors (5xx)
      if (response.status >= 500 && retry < MAX_RETRIES) {
        traceAPI(`[OpenRouter] Server error ${response.status}, retry ${retry + 1}/${MAX_RETRIES}`);
        await sleep(RETRY_DELAY_MS * (retry + 1));
        continue;
      }

      throw new Error(`OpenRouter streaming error ${response.status}: ${errMsg}`);
    }

    // Stream the response
    const resBody = response.body as ReadableStream<Uint8Array> | null;
    if (!resBody) {
      if (timeoutId) clearTimeout(timeoutId);
      throw new Error('No response body for OpenRouter streaming');
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
            const chunk = JSON.parse(dataStr) as OpenRouterChatStreamChunk;

            // Check if chunk was blocked by content filter
            if (
              chunk.choices &&
              chunk.choices.length > 0 &&
              chunk.choices[0].finish_reason === 'content_filter'
            ) {
              traceError(`[OpenRouter] Streaming response blocked by content filters`);
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

      traceAPI(`[OpenRouter] Streaming chat complete: model=${model}, text_len=${totalText.length}`);
      return; // Success — exit the retry loop
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      reader.releaseLock();
    }
  }

  // All retries exhausted
  throw lastError || new Error('OpenRouter streaming failed after retries');
}
