// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Cloudflare Workers AI Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides FREE AI access via Cloudflare Workers AI:
//   - GLM-5.2 (مجاني طول العمر)
//   - Llama 3.3 70B, Qwen, DeepSeek, إلخ
//
// Cloudflare Workers AI free tier慷慨 جداً — مناسب للاستخدام اليومي.
// API: https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

// ─── Embedded Credentials (مجاني طول العمر) ──
// الـ Account ID و API Token مدموجين في الكود عشان يشتغلوا على HuggingFace
// من غير ما تحتاج set env vars.
const EMBEDDED_CF_ACCOUNT_ID = '';
const EMBEDDED_CF_API_TOKEN = '';

// ─── API Key (env var priority → embedded fallback) ─────────────────
// V.21: Support multiple env var names for flexibility
export const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || EMBEDDED_CF_ACCOUNT_ID;
export const CF_API_TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || EMBEDDED_CF_API_TOKEN;

// ─── API Base URL ──────────────────────────────────────────────────
const CF_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai`;

// ─── Default Timeouts ──────────────────────────────────────────────
const STREAM_TIMEOUT_MS = 300_000; // 5 min

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── Cloudflare Model IDs ────────────────────────────────────────────

export type CloudflareModelId =
  | '@cf/zai-org/glm-5.2'
  | '@cf/zai-org/glm-4.7-flash'
  | '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  | '@cf/qwen/qwen2.5-coder-32b-instruct'
  | '@cf/qwen/qwq-32b'
  | '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
  | '@cf/meta/llama-3.1-8b-instruct-fp8'
  | '@cf/meta/llama-3.2-3b-instruct';

// ─── Chat Types (OpenAI-compatible) ────────────────────────────────────

export interface CloudflareChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: CloudflareModelId;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface CloudflareChatStreamChunk {
  content?: string;
  finishReason?: string;
}

// ─── Model Mapping ────────────────────────────────────────────────────

export interface CloudflareModelMappingEntry {
  cfModel: CloudflareModelId;
  maxTokens: number;
  contextWindow: number;
}

export function getCloudflareChatModelMapping(modelId?: string): CloudflareModelMappingEntry | null {
  const map: Record<string, CloudflareModelMappingEntry> = {
    'cloudflare-glm-5.2': { cfModel: '@cf/zai-org/glm-5.2', maxTokens: 16384, contextWindow: 128000 },
    'cloudflare-glm-4.7-flash': { cfModel: '@cf/zai-org/glm-4.7-flash', maxTokens: 8192, contextWindow: 128000 },
    'cloudflare-llama-3.3-70b': { cfModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', maxTokens: 8192, contextWindow: 128000 },
    'cloudflare-qwen-coder': { cfModel: '@cf/qwen/qwen2.5-coder-32b-instruct', maxTokens: 8192, contextWindow: 32000 },
    'cloudflare-qwq-32b': { cfModel: '@cf/qwen/qwq-32b', maxTokens: 8192, contextWindow: 32000 },
    'cloudflare-deepseek-r1': { cfModel: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', maxTokens: 8192, contextWindow: 64000 },
  };
  return map[modelId || ''] || null;
}

export function isCloudflareChatModel(modelId: string): boolean {
  return modelId.startsWith('cloudflare-');
}

// ─── Headers ──────────────────────────────────────────────────────────

function getCloudflareHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING CHAT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Stream chat completions from Cloudflare Workers AI.
 *
 * Cloudflare supports OpenAI-compatible /chat/completions endpoint with SSE streaming.
 * URL: {CF_API_BASE}/v1/chat/completions
 *
 * @param request - Chat request with messages, model, etc.
 * @yields CloudflareChatStreamChunk - Streamed chunks with content
 */
export async function* streamCloudflareChat(
  request: CloudflareChatRequest
): AsyncGenerator<CloudflareChatStreamChunk, void, unknown> {
  const {
    messages,
    model = '@cf/zai-org/glm-5.2',
    temperature = 0.7,
    max_tokens = 8192,
    top_p,
  } = request;

  // Cloudflare Workers AI supports OpenAI-compatible endpoint with streaming
  const url = `${CF_API_BASE}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  console.log(`[Cloudflare] Streaming chat: model=${model}, messages=${messages.length}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: getCloudflareHeaders(),
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error(`[Cloudflare] Streaming fetch failed: ${errMsg.slice(0, 100)}`);
    throw fetchError;
  }

  if (!response.ok) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorText = await response.text().catch(() => '');
    console.error(`[Cloudflare] Streaming chat error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(`Cloudflare streaming error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const resBody = response.body as ReadableStream<Uint8Array> | null;
  if (!resBody) {
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error('No response body for Cloudflare streaming');
  }

  const reader = resBody.getReader();
  const decoder = new TextDecoder();

  try {
    let buffer = '';

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
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta;
          if (delta?.content) {
            yield { content: delta.content };
          }
          if (data.choices?.[0]?.finish_reason) {
            yield { finishReason: data.choices[0].finish_reason };
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NON-STREAMING CHAT (for quick tests / fallbacks)
// ═══════════════════════════════════════════════════════════════════════

export async function generateCloudflareChat(
  request: CloudflareChatRequest
): Promise<string> {
  const {
    messages,
    model = '@cf/zai-org/glm-5.2',
    temperature = 0.7,
    max_tokens = 8192,
  } = request;

  // Use the /run/{model} endpoint for non-streaming
  const url = `${CF_API_BASE}/run/${model}`;

  const body = {
    messages,
    temperature,
    max_tokens,
  };

  console.log(`[Cloudflare] Non-streaming chat: model=${model}, messages=${messages.length}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: getCloudflareHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Cloudflare error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();

  // Cloudflare /run/ returns { result: { response: "..." } } or { result: { choices: [...] } }
  if (data.result?.response) {
    return data.result.response;
  }
  if (data.result?.choices?.[0]?.message?.content) {
    return data.result.choices[0].message.content;
  }
  throw new Error('Unexpected Cloudflare response format');
}
