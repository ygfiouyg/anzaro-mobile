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
// V.22: Use getters for lazy evaluation — env vars may not be available at module load
export function getCF_AccountId(): string {
  return process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || EMBEDDED_CF_ACCOUNT_ID;
}
export function getCF_ApiToken(): string {
  return process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || EMBEDDED_CF_API_TOKEN;
}
// Keep backward-compatible exports (evaluated at call time via getters)
export const CF_ACCOUNT_ID = getCF_AccountId();
export const CF_API_TOKEN = getCF_ApiToken();

// ─── API Base URL ──────────────────────────────────────────────────
// V.22: Compute at call time to ensure env vars are read at runtime
function getCF_ApiBase(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${getCF_AccountId()}/ai`;
}

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
    'Authorization': `Bearer ${getCF_ApiToken()}`,
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

  // V.23: Use /run/{model} endpoint (more reliable than /v1/chat/completions)
  // V.24: Use NON-streaming mode (HF Space has 10s timeout on streaming fetch)
  const url = `${getCF_ApiBase()}/run/${model}`;

  const body: Record<string, unknown> = {
    messages,
    stream: false, // Non-streaming to avoid HF Space 10s timeout
    temperature,
    max_tokens,
  };
  if (top_p !== undefined) body.top_p = top_p;

  console.log(`[Cloudflare] Non-streaming chat: model=${model}, url=${url}, account=${getCF_AccountId() ? 'SET' : 'EMPTY'}, token=${getCF_ApiToken() ? 'SET' : 'EMPTY'}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s for non-streaming

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
    console.error(`[Cloudflare] Chat error ${response.status}: ${errorText.slice(0, 300)}`);
    throw new Error(`Cloudflare error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  // V.24: Non-streaming response — parse JSON and yield as single chunk
  try {
    const data = await response.json();
    const content = data?.result?.choices?.[0]?.message?.content 
                 || data?.choices?.[0]?.message?.content 
                 || data?.result?.response 
                 || '';

    if (content) {
      console.log(`[Cloudflare] Success! Content length: ${content.length} chars`);
      yield { content };
      yield { finishReason: 'stop' };
    } else {
      console.error(`[Cloudflare] No content in response: ${JSON.stringify(data).slice(0, 200)}`);
      throw new Error('No content in Cloudflare response');
    }
  } catch (parseError) {
    console.error(`[Cloudflare] Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    throw parseError;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
  const url = `${getCF_ApiBase()}/run/${model}`;

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
