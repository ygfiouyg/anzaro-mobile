// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — OpenAI GPT-4o Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides direct access to OpenAI's GPT-4o model:
//   - Chat/text generation (streaming + non-streaming)
//   - Vision/image understanding (multimodal)
//   - Free-form request processing with file content
//
// This module uses the OpenAI API directly for maximum quality.
// The OPENAI_API_KEY environment variable must be set.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceError, traceAPI } from '@/lib/trace-logger';

// ─── API Key ────────────────────────────────────────────────────────────
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ─── API Base URL ──────────────────────────────────────────────────────
const OPENAI_API_BASE = 'https://api.openai.com/v1';

// ─── Default Timeouts ──────────────────────────────────────────────────
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const VISION_TIMEOUT_MS = 180_000; // 3 min — vision analysis

// ─── Default Retry Config ──────────────────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type OpenAIModelId = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4o-2024-11-20';

export interface OpenAIChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
  model?: OpenAIModelId;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface OpenAIChatResponse {
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

export interface OpenAIChatStreamChunk {
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

export interface OpenAIModelMappingEntry {
  /** OpenAI model ID to use */
  openaiModel: OpenAIModelId;
  /** Human-readable label */
  label: string;
  /** Description of the model's strengths */
  description: string;
  /** Maximum context window in tokens */
  maxContextTokens: number;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → OpenAI models
// ═══════════════════════════════════════════════════════════════════════

export const OPENAI_CHAT_MODEL_MAP: Record<string, OpenAIModelMappingEntry> = {
  'gpt-4o': {
    openaiModel: 'gpt-4o',
    label: 'GPT-4o',
    description: 'Most capable OpenAI model, excellent all-rounder with vision support',
    maxContextTokens: 128000,
  },
  'gpt-4o-mini': {
    openaiModel: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Fast and affordable GPT-4o variant, great for quick tasks',
    maxContextTokens: 128000,
  },
};

/**
 * Get OpenAI model mapping for a given frontend model ID.
 */
export function getOpenAIChatModelMapping(frontendModelId: string): OpenAIModelMappingEntry | null {
  return OPENAI_CHAT_MODEL_MAP[frontendModelId] || null;
}

/**
 * Check if a frontend model ID should use the OpenAI provider.
 */
export function isOpenAIChatModel(frontendModelId: string): boolean {
  return frontendModelId in OPENAI_CHAT_MODEL_MAP;
}

// ═══════════════════════════════════════════════════════════════════════
// NON-STREAMING CHAT
// ═══════════════════════════════════════════════════════════════════════

export async function generateOpenAIChat(
  request: OpenAIChatRequest
): Promise<OpenAIChatResponse> {
  const model = request.model || 'gpt-4o';
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.max_tokens ?? 8192,
          top_p: request.top_p ?? 0.9,
          stream: false,
        }),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as OpenAIChatResponse;

      try {
        traceAPI('/openai/chat', Date.now() - startTime, {
          model,
          tokens: data.usage?.total_tokens,
        });
      } catch { /* non-critical */ }

      return data;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.warn(
        `[OpenAI] Chat attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        error instanceof Error ? error.message : String(error)
      );

      if (isLastAttempt) {
        try { traceError('/openai/chat', error instanceof Error ? error.message : String(error)); } catch { /* non-critical */ }
        throw error;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  throw new Error('OpenAI chat: all retries exhausted');
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING CHAT
// ═══════════════════════════════════════════════════════════════════════

export async function* streamOpenAIChat(
  request: OpenAIChatRequest
): AsyncGenerator<OpenAIChatStreamChunk> {
  const model = request.model || 'gpt-4o';
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.max_tokens ?? 8192,
          top_p: request.top_p ?? 0.9,
          stream: true,
        }),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI streaming API error ${response.status}: ${errorBody}`);
      }

      if (!response.body) {
        throw new Error('OpenAI streaming: no response body');
      }

      const reader = response.body.getReader();
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
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const json = JSON.parse(trimmed.slice(6)) as OpenAIChatStreamChunk;
              yield json;
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      try {
        traceAPI('/openai/chat/stream', Date.now() - startTime, { model });
      } catch { /* non-critical */ }

      return; // Successfully completed streaming
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.warn(
        `[OpenAI] Stream attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        error instanceof Error ? error.message : String(error)
      );

      if (isLastAttempt) {
        try { traceError('/openai/chat/stream', error instanceof Error ? error.message : String(error)); } catch { /* non-critical */ }
        throw error;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  throw new Error('OpenAI streaming: all retries exhausted');
}
