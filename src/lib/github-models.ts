// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — GitHub Models AI Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides free AI access via GitHub Models API (OpenAI-compatible):
//   - Chat/text generation (streaming + non-streaming)
//   - Image generation via DALL-E 3
//   - Access to multiple models from OpenAI, Meta, Mistral, Microsoft,
//     Cohere, and AI21
//   - Free tier with GitHub Personal Access Token
//
// Chat Models (available on GitHub Models marketplace):
//   - gpt-4o, gpt-4o-mini                 (OpenAI)
//   - Meta-Llama-3.1-8B-Instruct          (Meta)
//   - Meta-Llama-3.1-70B-Instruct         (Meta)
//   - Mistral-large-2407                   (Mistral AI)
//   - Mistral-small                        (Mistral AI)
//   - Phi-3.5-mini-instruct, Phi-4         (Microsoft)
//   - Cohere-command-r-plus, Cohere-command-r (Cohere)
//   - AI21-Jamba-1.5-mini, AI21-Jamba-1.5-large (AI21 Labs)
//
// Image Models:
//   - dall-e-3                             (OpenAI)
//
// Key advantage: GitHub Models offers free access to top-tier
// models through an OpenAI-compatible API — ideal as a high-quality
// fallback provider. Models that are unavailable gracefully fall
// back to gpt-4o or gpt-4o-mini.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceError, traceAPI } from '@/lib/trace-logger';

// ─── API Key ────────────────────────────────────────────────────────────
export const GITHUB_API_KEY = process.env.GITHUB_MODELS_TOKEN || '';

// ─── API Base URL ──────────────────────────────────────────────────────
const GITHUB_API_BASE = 'https://models.github.ai/inference/v1';

// ─── Default Timeouts ──────────────────────────────────────────────────
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const STREAM_TIMEOUT_MS = 300_000; // 5 min — streaming code gen can take time
// NOTE: IMAGE_TIMEOUT_MS removed — DALL-E 3 image gen is no longer available

// ─── Default Retry Config ──────────────────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── GitHub Model IDs ──────────────────────────────────────────────────

export type GitHubModelId =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'Meta-Llama-3.1-8B-Instruct'
  | 'Meta-Llama-3.1-70B-Instruct'
  | 'Mistral-large-2407'
  | 'Mistral-small'
  | 'Phi-3.5-mini-instruct'
  | 'Phi-4'
  | 'Cohere-command-r-plus'
  | 'Cohere-command-r'
  | 'AI21-Jamba-1.5-mini'
  | 'AI21-Jamba-1.5-large';

// ─── Chat Types (OpenAI-compatible) ────────────────────────────────────

export interface GitHubChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: GitHubModelId;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface GitHubChatResponse {
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

export interface GitHubChatStreamChunk {
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

// ─── REMOVED: GitHub Image Model types (DALL-E 3 no longer available) ──
// GitHubImageModel, GITHUB_IMAGE_MODEL, GitHubImageRequest, GitHubImageResponse, GitHubImageResult
// have been removed. Image generation is handled by other providers.

// ─── Model Mapping Types ───────────────────────────────────────────────

export interface GitHubModelMappingEntry {
  /** GitHub model ID to use */
  githubModel: GitHubModelId;
  /** Human-readable label */
  label: string;
  /** Description of the model's strengths */
  description: string;
  /** Approximate relative capability tier (1-10) */
  capabilityTier: number;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → GitHub Models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chat model mapping: DeltaAI frontend model IDs → GitHub Models.
 *
 * Available GitHub Models (free tier):
 *   gpt-4o                       — Most capable OpenAI model
 *   gpt-4o-mini                  — Fast and affordable
 *   Meta-Llama-3.1-8B-Instruct   — Meta LLaMA 3.1 8B
 *   Meta-Llama-3.1-70B-Instruct  — Meta LLaMA 3.1 70B
 *   Mistral-large-2407           — Mistral Large
 *   Mistral-small                — Mistral Small
 *   Phi-3.5-mini-instruct        — Microsoft Phi 3.5 Mini
 *   Phi-4                        — Microsoft Phi 4
 *   Cohere-command-r-plus        — Cohere Command R+
 *   Cohere-command-r             — Cohere Command R
 *   AI21-Jamba-1.5-mini          — AI21 Jamba 1.5 Mini
 *   AI21-Jamba-1.5-large         — AI21 Jamba 1.5 Large
 *
 * NOTE: Not all models may work at any given time. The chat
 * functions will gracefully fall back to gpt-4o or gpt-4o-mini
 * if a model is unavailable.
 *
 * STRATEGY: Map premium/smart models to GPT-4o, fast/standard
 * models to GPT-4o-mini. Models with direct GitHub Models
 * support can use their native model IDs.
 */
export const GITHUB_CHAT_MODEL_MAP: Record<string, GitHubModelMappingEntry> = {
  // ─── Global models ───
  'gpt-4o': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Most capable OpenAI model, excellent for complex tasks',
    capabilityTier: 10,
  },
  'gemini-2': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Deep reasoning and comprehensive answers',
    capabilityTier: 10,
  },
  'claude-3-5': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Nuanced and careful reasoning',
    capabilityTier: 10,
  },
  'llama-3': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Direct and practical via GPT-4o',
    capabilityTier: 10,
  },
  'mistral-large': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Multilingual and precise via GPT-4o',
    capabilityTier: 10,
  },
  'command-r-plus': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Technical reasoning and retrieval-augmented generation',
    capabilityTier: 10,
  },

  // ─── Delta-branded models ───
  'delta-ultra': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Most advanced reasoning for deep insights',
    capabilityTier: 10,
  },
  'delta-pro': {
    githubModel: 'gpt-4o-mini',
    label: 'GPT-4o Mini (GitHub Models)',
    description: 'Professional-grade quality with speed',
    capabilityTier: 7,
  },
  'delta-flash': {
    githubModel: 'gpt-4o-mini',
    label: 'GPT-4o Mini (GitHub Models)',
    description: 'Ultra-fast responses with solid quality',
    capabilityTier: 7,
  },
  'delta-code': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Code generation and technical analysis',
    capabilityTier: 10,
  },
  'delta-creative': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Creative and imaginative responses',
    capabilityTier: 10,
  },
  'delta-philosopher': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Deep philosophical reasoning with maximum depth',
    capabilityTier: 10,
  },
  'delta-mathematician': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Step-by-step mathematical reasoning',
    capabilityTier: 10,
  },
  'delta-strategist': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Strategic analysis and multi-step planning',
    capabilityTier: 10,
  },

  // ─── GitHub-specific models (direct GitHub provider) ───
  'github-gpt4o': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Most capable OpenAI model via GitHub — free',
    capabilityTier: 10,
  },
  'github-gpt4o-mini': {
    githubModel: 'gpt-4o-mini',
    label: 'GPT-4o Mini (GitHub Models)',
    description: 'Fast and efficient OpenAI model via GitHub — free',
    capabilityTier: 7,
  },
  'github-llama': {
    githubModel: 'Meta-Llama-3.1-70B-Instruct',
    label: 'LLaMA 3.1 70B (GitHub Models)',
    description: 'Meta open-source model via GitHub — 70B parameters',
    capabilityTier: 8,
  },
  'github-phi4': {
    githubModel: 'Phi-4',
    label: 'Phi-4 (GitHub Models)',
    description: 'Microsoft compact intelligent model via GitHub',
    capabilityTier: 7,
  },
  'github-mistral': {
    githubModel: 'Mistral-large-2407',
    label: 'Mistral Large (GitHub Models)',
    description: 'Mistral Large via GitHub — high precision',
    capabilityTier: 9,
  },
  'github-cohere': {
    githubModel: 'Cohere-command-r-plus',
    label: 'Cohere Command R+ (GitHub Models)',
    description: 'Cohere research model via GitHub — RAG capabilities',
    capabilityTier: 8,
  },

  // ─── Catch-all for other delta models ───
  // (Any delta-* model not listed above maps to gpt-4o-mini)
  'delta-default': {
    githubModel: 'gpt-4o-mini',
    label: 'GPT-4o Mini (GitHub Models)',
    description: 'Fast and capable general-purpose model',
    capabilityTier: 7,
  },

  // ─── GitHub Models (new — direct gh-* IDs) ───
  'gh-gpt-4o': {
    githubModel: 'gpt-4o',
    label: 'GPT-4o (GitHub Models)',
    description: 'Most capable OpenAI model — free via GitHub Models',
    capabilityTier: 10,
  },
  'gh-gpt-4o-mini': {
    githubModel: 'gpt-4o-mini',
    label: 'GPT-4o Mini (GitHub Models)',
    description: 'Fast and economical — free via GitHub Models',
    capabilityTier: 7,
  },
  'gh-llama-70b': {
    githubModel: 'Llama-3.3-70B-Instruct',
    label: 'Llama 3.3 70B (GitHub Models)',
    description: 'Meta Llama 3.3 70B — free via GitHub Models',
    capabilityTier: 8,
  },
  'gh-llama-405b': {
    githubModel: 'Meta-Llama-3.1-405B-Instruct',
    label: 'Llama 3.1 405B (GitHub Models)',
    description: 'Meta Llama 3.1 405B — free via GitHub Models',
    capabilityTier: 10,
  },
  'gh-llama-8b': {
    githubModel: 'Meta-Llama-3.1-8B-Instruct',
    label: 'Llama 3.1 8B (GitHub Models)',
    description: 'Meta Llama 3.1 8B — free via GitHub Models',
    capabilityTier: 6,
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
  return `github_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the standard headers for GitHub Models API requests.
 * Throws a clear error if no token is configured.
 */
function getGitHubHeaders(): Record<string, string> {
  if (!GITHUB_API_KEY) {
    throw new Error(
      'GitHub Models token is not configured. Set the GITHUB_MODELS_TOKEN environment variable with your GitHub Personal Access Token.'
    );
  }
  return {
    'Authorization': `Bearer ${GITHUB_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Check if an error indicates content was filtered.
 */
export function isGitHubContentFilterError(error: unknown): boolean {
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
function isResponseFiltered(response: GitHubChatResponse): boolean {
  if (!response.choices || response.choices.length === 0) return true;
  const choice = response.choices[0];
  return choice.finish_reason === 'content_filter';
}

/**
 * Extract text from a GitHub response.
 */
function extractTextFromResponse(response: GitHubChatResponse): string {
  if (!response.choices || response.choices.length === 0) return '';
  return response.choices[0].message?.content || '';
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the GitHub model mapping for a given DeltaAI frontend model ID.
 * Returns a default mapping (GPT-4o Mini) if the model is not found.
 * For any unrecognized delta-* model, also maps to GPT-4o Mini.
 */
export function getGitHubChatModelMapping(modelId?: string): GitHubModelMappingEntry {
  if (modelId && GITHUB_CHAT_MODEL_MAP[modelId]) {
    return GITHUB_CHAT_MODEL_MAP[modelId];
  }
  // If it's a delta-* model not in the map, return the default delta mapping
  if (modelId && modelId.startsWith('delta-')) {
    return GITHUB_CHAT_MODEL_MAP['delta-default'];
  }
  // Default to GPT-4o Mini for completely unknown models
  return {
    githubModel: 'gpt-4o-mini',
    label: 'GPT-4o Mini (GitHub Models)',
    description: 'Default fast and capable model',
    capabilityTier: 7,
  };
}

/**
 * Check if a given model ID has a GitHub Models mapping.
 * Returns true for any model ID (including delta-* models that
 * fall back to the default mapping).
 */
export function isGitHubChatModel(modelId: string): boolean {
  if (modelId in GITHUB_CHAT_MODEL_MAP) return true;
  // All delta-* models are mappable (they fall back to default)
  if (modelId.startsWith('delta-')) return true;
  // All github-* models are mappable (direct GitHub provider models)
  if (modelId.startsWith('github-')) return true;
  // All gh-* models are mappable (new direct GitHub Models IDs)
  if (modelId.startsWith('gh-')) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// REMOVED: IMAGE GENERATION (DALL-E 3 via GitHub Models)
// ═══════════════════════════════════════════════════════════════════════
// DALL-E 3 token expired (401), no longer available.
// Image generation is handled by Pollinations, ZhipuAI, HuggingFace, and Z-AI SDK.
// See src/app/api/ai/image/route.ts for the current image generation pipeline.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Non-Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a chat completion using GitHub Models API.
 *
 * Endpoint: POST /v1/chat/completions
 * Format: OpenAI-compatible (same request/response shape)
 *
 * Requires GITHUB_MODELS_TOKEN environment variable to be set.
 */
export async function generateGitHubChat(
  request: GitHubChatRequest
): Promise<GitHubChatResponse> {
  const {
    messages,
    model = 'gpt-4o-mini',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  const url = `${GITHUB_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[GitHub Models] Chat completion: model=${model}, messages=${messages.length}`);

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const headers = getGitHubHeaders(); // Will throw if no token

      const controller = new AbortController();
      const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(body),
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errMsg = errorText.slice(0, 300);

        // Handle rate limiting
        if (response.status === 429) {
          traceError(`[GitHub Models] Rate limited (429), retry ${retry + 1}/${MAX_RETRIES}`);
          if (retry < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (retry + 1));
            continue;
          }
        }

        // Handle server errors with retry
        if (response.status >= 500 && retry < MAX_RETRIES) {
          traceError(`[GitHub Models] Server error ${response.status}, retry ${retry + 1}/${MAX_RETRIES}`);
          await sleep(RETRY_DELAY_MS * (retry + 1));
          continue;
        }

        throw new Error(`GitHub Models API error ${response.status}: ${errMsg}`);
      }

      const result = (await response.json()) as GitHubChatResponse;

      // Check if response was blocked by content filters
      if (isResponseFiltered(result)) {
        traceError(`[GitHub Models] Response blocked by content filters`);
        throw new Error('GitHub Models response blocked by content filters');
      }

      const text = extractTextFromResponse(result);
      traceAPI(`[GitHub Models] Chat completion success: model=${model}, tokens=${result.usage?.total_tokens ?? 'unknown'}, text_len=${text.length}`);

      return { ...result, id: result.id || generateId() };
    } catch (chatError) {
      lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
      traceAPI(`[GitHub Models] Chat attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isGitHubContentFilterError(chatError)) break;
      if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[GitHub Models] Chat completion failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('GitHub Models chat completion failed');
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a streaming chat completion using GitHub Models API.
 * Returns an async generator that yields OpenAI-compatible SSE chunks.
 *
 * Endpoint: POST /v1/chat/completions with stream: true
 *
 * GitHub Models returns SSE events identical to OpenAI:
 *   data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 *
 * Requires GITHUB_MODELS_TOKEN environment variable to be set.
 */
export async function* streamGitHubChat(
  request: GitHubChatRequest
): AsyncGenerator<GitHubChatStreamChunk, void, unknown> {
  const {
    messages,
    model = 'gpt-4o-mini',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  const url = `${GITHUB_API_BASE}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  traceAPI(`[GitHub Models] Streaming chat: model=${model}, messages=${messages.length}`);

  const headers = getGitHubHeaders(); // Will throw if no token

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    traceError(`[GitHub Models] Streaming fetch failed: ${errMsg.slice(0, 100)}`);
    throw fetchError;
  }

  if (!response.ok) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorText = await response.text().catch(() => '');
    traceError(`[GitHub Models] Streaming chat error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(`GitHub Models streaming error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const resBody = response.body as ReadableStream<Uint8Array> | null;
  if (!resBody) {
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error('No response body for GitHub Models streaming');
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
          const chunk = JSON.parse(dataStr) as GitHubChatStreamChunk;

          // Check if chunk was blocked by content filter
          if (
            chunk.choices &&
            chunk.choices.length > 0 &&
            chunk.choices[0].finish_reason === 'content_filter'
          ) {
            traceError(`[GitHub Models] Streaming response blocked by content filters`);
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

    traceAPI(`[GitHub Models] Streaming chat complete: model=${model}, text_len=${totalText.length}`);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    reader.releaseLock();
  }
}
