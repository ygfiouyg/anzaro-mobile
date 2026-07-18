// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Chat Service (Dynamic Models)
// ═══════════════════════════════════════════════════════════════════════
// Comprehensive chat service using the HuggingFace Serverless Inference
// API (OpenAI-compatible endpoint) for FREE chat completions.
//
// Endpoint: https://router.huggingface.co/v1/chat/completions
// Models:  https://router.huggingface.co/v1/models
// Auth:     Bearer token from process.env.HUGGINGFACE_API_TOKEN
//
// Features:
//   - Dynamic model fetching from HF Router API with 1-hour cache
//   - Automatic fallback to hardcoded reliable models if API fails
//   - Models organized into categories by model ID prefix / owned_by
//   - Streaming and non-streaming chat completions
//   - Automatic fallback via load balancer
//   - Cold start detection (503 with "loading" message)
//   - Timeout handling (120s for chat)
//   - Rate limit detection with smart model switching
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { getHFLoadBalancer } from '@/lib/hf-load-balancer';

// ─── API Configuration ────────────────────────────────────────────────
const HF_CHAT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODELS_ENDPOINT = 'https://router.huggingface.co/v1/models';
export const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';
// تم إلغاء timeout — البث مفيش مهلة (عبس طلب كده)
const CHAT_TIMEOUT_MS = 0; // 0 = no timeout
const MAX_FALLBACK_ATTEMPTS = 5;  // Max models to try in fallback chain
const CACHE_TTL_MS = 3_600_000;  // 1 hour cache for model list

/** Get authorization headers for HF API requests */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (HF_API_TOKEN) {
    headers['Authorization'] = `Bearer ${HF_API_TOKEN}`;
  }
  return headers;
}

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

/** A single chat model entry with metadata */
export interface HFChatModelEntry {
  /** HuggingFace model repository ID (e.g., 'meta-llama/Llama-3.1-8B-Instruct') */
  id: string;
  /** Human-readable name (e.g., 'Llama 3.1 8B Instruct') */
  name: string;
  /** Short name for UI badges (e.g., 'Llama 3.1 8B') */
  shortName: string;
  /** Category this model belongs to */
  category: HFChatCategory;
  /** Parameter count badge (e.g., '8B', '70B', '8x7B') */
  size: string;
  /** Whether this model is currently available */
  available: boolean;
  /** Context window size in tokens (for display) */
  maxTokens?: number;
}

/** Chat message in OpenAI format */
export interface HFChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options for chat completion requests */
export interface HFChatOptions {
  /** Sampling temperature (0-2, default 0.7) */
  temperature?: number;
  /** Maximum tokens to generate (default 2048) */
  max_tokens?: number;
  /** Top-p sampling (0-1, default 0.9) */
  top_p?: number;
  /** Whether to stream the response (default false) */
  stream?: boolean;
  /** Custom system prompt override */
  systemPrompt?: string;
}

/** Result from chatWithFallback */
export interface HFChatFallbackResult {
  /** The full response text */
  content: string;
  /** The model ID that was actually used */
  modelUsed: string;
  /** Whether a fallback model was used instead of the preferred one */
  wasFallback: boolean;
  /** Number of models tried before success */
  attempts: number;
  /** Response time in milliseconds */
  responseTimeMs: number;
}

/** Category names for model groups */
export type HFChatCategory =
  | 'Meta Llama'
  | 'Qwen'
  | 'Mistral'
  | 'Google'
  | 'DeepSeek'
  | 'Cohere'
  | 'Z.AI'
  | 'OpenAI'
  | 'Moonshot'
  | 'MiniMax'
  | 'NousResearch'
  | 'Allen AI'
  | 'Swiss AI'
  | 'Sao10K'
  | 'Other';

// ═══════════════════════════════════════════════════════════════════════
// CATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════════════

/** Map model ID prefixes to category names */
const CATEGORY_PREFIX_MAP: Record<string, HFChatCategory> = {
  'meta-llama/': 'Meta Llama',
  'Qwen/': 'Qwen',
  'deepseek-ai/': 'DeepSeek',
  'google/': 'Google',
  'mistralai/': 'Mistral',
  'CohereLabs/': 'Cohere',
  'zai-org/': 'Z.AI',
  'openai/': 'OpenAI',
  'moonshotai/': 'Moonshot',
  'MiniMaxAI/': 'MiniMax',
  'NousResearch/': 'NousResearch',
  'allenai/': 'Allen AI',
  'swiss-ai/': 'Swiss AI',
  'Sao10K/': 'Sao10K',
};

/**
 * Determine the category for a model based on its ID prefix or owned_by field.
 */
function categorizeModel(modelId: string, ownedBy?: string): HFChatCategory {
  // First try matching by model ID prefix (most reliable)
  for (const [prefix, category] of Object.entries(CATEGORY_PREFIX_MAP)) {
    if (modelId.startsWith(prefix)) {
      return category;
    }
  }

  // Then try matching by owned_by field
  if (ownedBy) {
    const ownedByLower = ownedBy.toLowerCase();
    if (ownedByLower.includes('meta') || ownedByLower.includes('llama')) return 'Meta Llama';
    if (ownedByLower.includes('qwen') || ownedByLower.includes('alibaba')) return 'Qwen';
    if (ownedByLower.includes('deepseek')) return 'DeepSeek';
    if (ownedByLower.includes('google')) return 'Google';
    if (ownedByLower.includes('mistral')) return 'Mistral';
    if (ownedByLower.includes('cohere')) return 'Cohere';
    if (ownedByLower.includes('z.ai') || ownedByLower.includes('zhipu')) return 'Z.AI';
    if (ownedByLower.includes('openai')) return 'OpenAI';
    if (ownedByLower.includes('moonshot')) return 'Moonshot';
    if (ownedByLower.includes('minimax')) return 'MiniMax';
    if (ownedByLower.includes('nous')) return 'NousResearch';
    if (ownedByLower.includes('allen')) return 'Allen AI';
    if (ownedByLower.includes('swiss')) return 'Swiss AI';
    if (ownedByLower.includes('sao10k')) return 'Sao10K';
  }

  return 'Other';
}

// ═══════════════════════════════════════════════════════════════════════
// SIZE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extract a parameter size badge from a model name.
 * E.g., "Llama-3.1-8B-Instruct" → "8B", "Mixtral-8x7B" → "8x7B"
 */
function extractSize(modelId: string): string {
  const name = modelId.split('/')[1] || modelId;

  // Match patterns like "8x7B", "17Bx128E", "16x3.8B"
  const moeMatch = name.match(/(\d+(?:\.\d+)?x\d+(?:\.\d+)?[BME])/i);
  if (moeMatch) return moeMatch[1];

  // Match patterns like "8B", "70B", "671B", "1.7B", "0.5B", "360M", "135M"
  const sizeMatch = name.match(/(\d+(?:\.\d+)?[BM])/i);
  if (sizeMatch) return sizeMatch[1];

  return '?';
}

/**
 * Generate a human-readable name from a model ID.
 * E.g., "meta-llama/Llama-3.1-8B-Instruct" → "Llama 3.1 8B Instruct"
 */
function generateName(modelId: string): string {
  const name = modelId.split('/')[1] || modelId;
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a short name from a model ID for UI badges.
 * E.g., "meta-llama/Llama-3.1-8B-Instruct" → "Llama 3.1 8B"
 */
function generateShortName(modelId: string): string {
  const name = modelId.split('/')[1] || modelId;
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+(Instruct|Chat|IT|it|v\d+(?:\.\d+)?)\s*$/i, '')
    .replace(/\s+(FP8|BF16|FP16|GPTQ|AWQ)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════
// HARDCODED FALLBACK MODEL LIST
// ═══════════════════════════════════════════════════════════════════════
// These are verified to work on the HF Router API. Used when the
// dynamic fetch fails or before the first fetch completes.

const FALLBACK_MODEL_IDS: string[] = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'meta-llama/Llama-3.3-70B-Instruct',
  'meta-llama/Meta-Llama-3-8B-Instruct',
  'meta-llama/Llama-3.2-1B-Instruct',
  'meta-llama/Meta-Llama-3-70B-Instruct',
  'meta-llama/Llama-3.1-70B-Instruct',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'Qwen/Qwen3-8B',
  'Qwen/Qwen3-32B',
  'Qwen/Qwen3-14B',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/QwQ-32B',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'Qwen/Qwen2.5-Coder-3B-Instruct',
  'Qwen/Qwen3-4B-Instruct-2507',
  'Qwen/Qwen3-Coder-30B-A3B-Instruct',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'deepseek-ai/DeepSeek-R1',
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
  'deepseek-ai/DeepSeek-V3-0324',
  'deepseek-ai/DeepSeek-R1-0528',
  'deepseek-ai/DeepSeek-V3.1',
  'deepseek-ai/DeepSeek-V3.2',
  'google/gemma-3-27b-it',
  'google/gemma-4-31B-it',
  'google/gemma-4-26B-A4B-it',
  'google/gemma-3n-E4B-it',
  'CohereLabs/c4ai-command-r-08-2024',
  'CohereLabs/aya-expanse-32b',
  'zai-org/GLM-5',
  'zai-org/GLM-5.1',
  'zai-org/GLM-4.7',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'NousResearch/Hermes-2-Pro-Llama-3-8B',
  'moonshotai/Kimi-K2-Instruct',
  'MiniMaxAI/MiniMax-M2',
];

/** Build an HFChatModelEntry from a model ID */
/** Estimate context window from model ID/name — HF doesn't always expose this */
export function estimateMaxTokens(modelId: string): number {
  const name = modelId.toLowerCase();
  // Known large context models
  if (name.includes("gemma-2-27b") || name.includes("gemma-2-9b")) return 8000;
  if (name.includes("llama-3.1") || name.includes("llama-3.3")) return 128000;
  if (name.includes("llama-3.2")) return 128000;
  if (name.includes("qwen2.5") || name.includes("qwen-2.5")) return 32768;
  if (name.includes("qwen2-72b")) return 32768;
  if (name.includes("mistral") || name.includes("mixtral")) return 32768;
  if (name.includes("deepseek")) return 64000;
  if (name.includes("phi-3") || name.includes("phi-4")) return 128000;
  if (name.includes("gemma")) return 8000;
  if (name.includes("glm")) return 128000;
  if (name.includes("command-r")) return 128000;
  // Default for unknown models
  return 8192;
}

function buildModelEntry(modelId: string, ownedBy?: string): HFChatModelEntry {
  return {
    id: modelId,
    name: generateName(modelId),
    shortName: generateShortName(modelId),
    category: categorizeModel(modelId, ownedBy),
    size: extractSize(modelId),
    available: true,
    maxTokens: estimateMaxTokens(modelId),
  };
}

/** Build the fallback models record */
function buildFallbackModels(): Record<string, HFChatModelEntry> {
  const models: Record<string, HFChatModelEntry> = {};
  for (const modelId of FALLBACK_MODEL_IDS) {
    models[modelId] = buildModelEntry(modelId);
  }
  return models;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL CACHE — Dynamic Fetching with 1-Hour TTL
// ═══════════════════════════════════════════════════════════════════════

interface ModelCache {
  models: Record<string, HFChatModelEntry>;
  categories: HFChatCategory[];
  categoryModelMap: Map<HFChatCategory, string[]>;
  modelIdList: string[];
  timestamp: number;
  source: 'api' | 'fallback';
}

/** Initialize the cache with the fallback list so it's always usable synchronously */
function buildInitialCache(): ModelCache {
  const models = buildFallbackModels();
  const { categories, categoryModelMap, modelIdList } = buildCategoryData(models);
  return {
    models,
    categories,
    categoryModelMap,
    modelIdList,
    timestamp: 0, // 0 means "never fetched from API"
    source: 'fallback',
  };
}

/** Build category data from a models record */
function buildCategoryData(models: Record<string, HFChatModelEntry>) {
  const categorySet = new Set<HFChatCategory>();
  const categoryModelMap = new Map<HFChatCategory, string[]>();

  // Pre-populate known categories in order
  const knownCategories: HFChatCategory[] = [
    'Meta Llama', 'Qwen', 'Mistral', 'Google', 'DeepSeek',
    'Cohere', 'Z.AI', 'OpenAI', 'Moonshot', 'MiniMax',
    'NousResearch', 'Allen AI', 'Swiss AI', 'Sao10K', 'Other',
  ];
  for (const cat of knownCategories) {
    categorySet.add(cat);
    categoryModelMap.set(cat, []);
  }

  for (const [id, entry] of Object.entries(models)) {
    if (!categorySet.has(entry.category)) {
      categorySet.add(entry.category);
      categoryModelMap.set(entry.category, []);
    }
    categoryModelMap.get(entry.category)?.push(id);
  }

  // Build ordered categories: known order first, then any extras
  const categories = knownCategories.filter((cat) => (categoryModelMap.get(cat)?.length ?? 0) > 0);

  const modelIdList = Object.keys(models);

  return { categories, categoryModelMap, modelIdList };
}

/** The current model cache — initialized synchronously with fallback list */
let _cache: ModelCache = buildInitialCache();

/** In-flight fetch promise to avoid duplicate concurrent fetches */
let _fetchPromise: Promise<Record<string, HFChatModelEntry>> | null = null;

/**
 * Fetch available chat models from the HF Router API.
 * Uses cursor-based pagination to fetch ALL available models.
 * Returns a record of model entries keyed by model ID.
 */
async function fetchModelsFromAPI(): Promise<Record<string, HFChatModelEntry>> {
  console.log('[HF-Chat] Fetching models from HF Router API...');

  try {
    const headers: Record<string, string> = {};
    if (HF_API_TOKEN) {
      headers['Authorization'] = `Bearer ${HF_API_TOKEN}`;
    }

    // Use cursor-based pagination to fetch all models
    const allModels: Array<{ id: string; owned_by?: string }> = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;
    const MAX_PAGES = 10; // Safety limit: 10 pages × 200 = 2000 models max

    while (pageCount < MAX_PAGES) {
      pageCount++;
      let url = `${HF_MODELS_ENDPOINT}?limit=200`;
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        console.warn(`[HF-Chat] Models API returned ${response.status}, using fallback list`);
        return buildFallbackModels();
      }

      const data = await response.json();

      // The API returns an object with a "data" field containing model objects
      const modelList: Array<{ id: string; owned_by?: string; object?: string }> = Array.isArray(data)
        ? data
        : (data.data ?? []);

      if (modelList.length === 0) {
        // No more results
        break;
      }

      allModels.push(...modelList);

      // Check for next page cursor
      const nextCursor = data.cursor || data.next_cursor;
      if (!nextCursor || modelList.length < 200) {
        // No more pages
        break;
      }
      cursor = nextCursor;
    }

    const models: Record<string, HFChatModelEntry> = {};

    for (const model of allModels) {
      // Skip non-chat models (some endpoints return all model types)
      if (!model.id) continue;

      models[model.id] = buildModelEntry(model.id, model.owned_by);
    }

    const count = Object.keys(models).length;
    console.log(`[HF-Chat] Fetched ${count} models from HF Router API (${pageCount} pages)`);

    if (count === 0) {
      console.warn('[HF-Chat] API returned 0 models, using fallback list');
      return buildFallbackModels();
    }

    return models;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[HF-Chat] Failed to fetch models from API: ${errorMsg}, using fallback list`);
    return buildFallbackModels();
  }
}

/**
 * Ensure the model cache is up-to-date. Fetches from API if cache is expired
 * or hasn't been populated yet. Uses a shared promise to avoid duplicate fetches.
 */
async function ensureCache(): Promise<ModelCache> {
  const now = Date.now();

  // Return cached data if still fresh
  if (_cache.timestamp > 0 && (now - _cache.timestamp) < CACHE_TTL_MS) {
    return _cache;
  }

  // If a fetch is already in progress, wait for it
  if (_fetchPromise) {
    await _fetchPromise;
    return _cache;
  }

  // Start a new fetch
  _fetchPromise = fetchModelsFromAPI();

  try {
    const models = await _fetchPromise;
    const { categories, categoryModelMap, modelIdList } = buildCategoryData(models);

    _cache = {
      models,
      categories,
      categoryModelMap,
      modelIdList,
      timestamp: Date.now(),
      source: 'api',
    };

    const count = Object.keys(models).length;
    console.log(`[HF-Chat] Cache updated with ${count} models (source: api)`);
  } finally {
    _fetchPromise = null;
  }

  return _cache;
}

/**
 * Force-refresh the model cache (useful for admin operations).
 */
export async function refreshModelCache(): Promise<void> {
  _fetchPromise = null;
  _cache = { ..._cache, timestamp: 0 };
  await ensureCache();
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API — Model Access
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get all chat models as a Record<string, HFChatModelEntry>.
 * This is the async version that ensures the cache is fresh.
 * Use this in API route handlers and other async contexts.
 */
export async function getChatModels(): Promise<Record<string, HFChatModelEntry>> {
  const cache = await ensureCache();
  return cache.models;
}

/**
 * Convenience export — returns the currently cached models synchronously.
 * For the freshest data in async contexts, use `await getChatModels()` instead.
 * This always returns at least the fallback model list.
 */
export const HFChatModels: Record<string, HFChatModelEntry> = new Proxy(
  {} as Record<string, HFChatModelEntry>,
  {
    get(_target, prop: string | symbol) {
      if (prop === Symbol.toPrimitive || prop === Symbol.iterator || typeof prop === 'symbol') {
        return undefined;
      }
      return _cache.models[prop as string];
    },
    ownKeys() {
      return Object.keys(_cache.models);
    },
    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (typeof prop === 'string' && prop in _cache.models) {
        return { configurable: true, enumerable: true, value: _cache.models[prop] };
      }
      return undefined;
    },
    has(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return false;
      return prop in _cache.models;
    },
  }
);

/** All model categories in display order (based on current cache) */
export const HF_CHAT_CATEGORIES: HFChatCategory[] = new Proxy(
  [] as HFChatCategory[],
  {
    get(_target, prop) {
      if (prop === 'length') return _cache.categories.length;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return _cache.categories[parseInt(prop)];
      }
      if (prop === Symbol.iterator) {
        return function* () {
          for (const cat of _cache.categories) yield cat;
        };
      }
      return Reflect.get(_cache.categories, prop);
    },
    ownKeys() {
      return _cache.categories.map((_, i) => String(i));
    },
    getOwnPropertyDescriptor(_target, prop) {
      const idx = typeof prop === 'string' ? parseInt(prop) : -1;
      if (idx >= 0 && idx < _cache.categories.length) {
        return { configurable: true, enumerable: true, value: _cache.categories[idx] };
      }
      return undefined;
    },
    has(_target, prop) {
      const idx = typeof prop === 'string' ? parseInt(prop) : -1;
      return idx >= 0 && idx < _cache.categories.length;
    },
  }
);

/**
 * Get all model IDs as a flat array.
 * @returns Array of all model IDs
 */
export function getAllChatModelIds(): string[] {
  return _cache.modelIdList.filter(id => {
    const entry = _cache.models[id];
    return entry?.available !== false;
  });
}

/**
 * Get a specific model entry by its ID.
 * @param id - The HuggingFace model ID (e.g., 'meta-llama/Llama-3.1-8B-Instruct')
 * @returns The model entry, or undefined if not found
 */
export function getChatModelById(id: string): HFChatModelEntry | undefined {
  return _cache.models[id];
}

/**
 * Get all models belonging to a specific category.
 * @param category - The category to filter by
 * @returns Array of model entries in that category
 */
export function getModelsByCategory(category: HFChatCategory): HFChatModelEntry[] {
  const ids = _cache.categoryModelMap.get(category) ?? [];
  return ids.map((id) => _cache.models[id]).filter((entry): entry is HFChatModelEntry => !!entry?.available);
}

/**
 * Get a random available chat model, optionally from a specific category.
 * @param category - Optional category to restrict the random selection
 * @returns A random model entry, or null if no available models
 */
export function getRandomChatModel(category?: HFChatCategory): HFChatModelEntry | null {
  const candidates = category
    ? (_cache.categoryModelMap.get(category) ?? []).filter((id) => _cache.models[id]?.available)
    : _cache.modelIdList.filter((id) => _cache.models[id]?.available);

  if (candidates.length === 0) return null;

  const randomId = candidates[Math.floor(Math.random() * candidates.length)];
  return _cache.models[randomId] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING CHAT COMPLETION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Stream a chat completion from the HuggingFace Serverless Inference API.
 * Yields content strings as they arrive (SSE streaming).
 *
 * @param messages - Array of chat messages in OpenAI format
 * @param model - HuggingFace model ID (defaults to Llama-3.1-8B-Instruct)
 * @param options - Optional generation parameters
 * @yields Content string chunks as they stream from the API
 *
 * @example
 * ```ts
 * for await (const chunk of streamHFChatCompletion(messages, 'meta-llama/Llama-3.1-8B-Instruct')) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export async function* streamHFChatCompletion(
  messages: HFChatMessage[],
  model: string = 'meta-llama/Llama-3.1-8B-Instruct',
  options?: HFChatOptions
): AsyncGenerator<string> {
  const startTime = Date.now();
  console.log(`[HF-Chat] Stream start: model=${model}`);

  // Build the messages array with optional system prompt override
  const chatMessages = options?.systemPrompt
    ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages.filter((m) => m.role !== 'system')]
    : messages;

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(HF_CHAT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: getAuthHeaders(),
      body: JSON.stringify({
        model,
        messages: chatMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 8192,
        top_p: options?.top_p ?? 0.9,
        stream: true,
      }),
    });

    // Handle cold start (503 with "loading")
    if (response.status === 503) {
      const errorText = await response.text().catch(() => '');
      if (errorText.includes('loading') || errorText.includes('currently loading')) {
        const estimatedTime = errorText.match(/estimated_time.*?(\d+\.?\d*)/)?.[1] || '60';
        console.log(`[HF-Chat] Model ${model} is loading (cold start), est. ${estimatedTime}s`);
        const lb = getHFLoadBalancer();
        lb.recordFailure(model, 'loading');
        throw new Error(`Model ${model} is loading (cold start). Estimated time: ${estimatedTime}s`);
      }
    }

    // Handle rate limiting (429)
    if (response.status === 429) {
      console.log(`[HF-Chat] Rate limited on model ${model}`);
      const lb = getHFLoadBalancer();
      lb.recordFailure(model, 'rate_limit');
      throw new Error(`Rate limited on model ${model}`);
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.log(`[HF-Chat] Error ${response.status} from model ${model}: ${errorText.slice(0, 200)}`);
      const lb = getHFLoadBalancer();
      lb.recordFailure(model, 'error');
      throw new Error(`HuggingFace chat error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    // Parse the SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No readable stream from HuggingFace');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let totalContent = '';

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
          if (dataStr === '[DONE]') {
            const elapsed = Date.now() - startTime;
            console.log(`[HF-Chat] Stream complete: model=${model}, ${totalContent.length} chars, ${elapsed}ms`);
            const lb = getHFLoadBalancer();
            lb.recordSuccess(model, elapsed);
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta;
            // GLM-5.2 returns reasoning + content — yield both
            const content = delta?.content || '';
            const reasoning = delta?.reasoning || delta?.reasoning_content || '';
            if (content) {
              totalContent += content;
              yield content;
            }
            // Reasoning is yielded as-is (some models return it separately)
            if (reasoning) {
              yield reasoning;
            }
          } catch {
            // Skip unparseable SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[HF-Chat] Timeout on model ${model} (${CHAT_TIMEOUT_MS}ms)`);
      const lb = getHFLoadBalancer();
      lb.recordFailure(model, 'timeout');
      throw new Error(`Chat completion timed out on model ${model} (${CHAT_TIMEOUT_MS}ms)`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NON-STREAMING CHAT COMPLETION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a complete (non-streaming) chat completion.
 * Returns the full response text once generation is complete.
 *
 * @param messages - Array of chat messages in OpenAI format
 * @param model - HuggingFace model ID (defaults to Llama-3.1-8B-Instruct)
 * @param options - Optional generation parameters
 * @returns The complete response text
 *
 * @example
 * ```ts
 * const reply = await generateHFChatCompletion(messages, 'Qwen/Qwen2.5-72B-Instruct');
 * console.log(reply);
 * ```
 */
export async function generateHFChatCompletion(
  messages: HFChatMessage[],
  model: string = 'meta-llama/Llama-3.1-8B-Instruct',
  options?: HFChatOptions
): Promise<string> {
  const startTime = Date.now();
  console.log(`[HF-Chat] Generate start: model=${model}`);

  // Build the messages array with optional system prompt override
  const chatMessages = options?.systemPrompt
    ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages.filter((m) => m.role !== 'system')]
    : messages;

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(HF_CHAT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: getAuthHeaders(),
      body: JSON.stringify({
        model,
        messages: chatMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 2048,
        top_p: options?.top_p ?? 0.9,
        stream: false,
      }),
    });

    // Handle cold start (503 with "loading")
    if (response.status === 503) {
      const errorText = await response.text().catch(() => '');
      if (errorText.includes('loading') || errorText.includes('currently loading')) {
        const estimatedTime = errorText.match(/estimated_time.*?(\d+\.?\d*)/)?.[1] || '60';
        console.log(`[HF-Chat] Model ${model} is loading (cold start), est. ${estimatedTime}s`);
        const lb = getHFLoadBalancer();
        lb.recordFailure(model, 'loading');
        throw new Error(`Model ${model} is loading (cold start). Estimated time: ${estimatedTime}s`);
      }
    }

    // Handle rate limiting (429)
    if (response.status === 429) {
      console.log(`[HF-Chat] Rate limited on model ${model}`);
      const lb = getHFLoadBalancer();
      lb.recordFailure(model, 'rate_limit');
      throw new Error(`Rate limited on model ${model}`);
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.log(`[HF-Chat] Error ${response.status} from model ${model}: ${errorText.slice(0, 200)}`);
      const lb = getHFLoadBalancer();
      lb.recordFailure(model, 'error');
      throw new Error(`HuggingFace chat error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';
    const elapsed = Date.now() - startTime;

    console.log(`[HF-Chat] Generate complete: model=${model}, ${content.length} chars, ${elapsed}ms`);

    const lb = getHFLoadBalancer();
    lb.recordSuccess(model, elapsed);

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[HF-Chat] Timeout on model ${model} (${CHAT_TIMEOUT_MS}ms)`);
      const lb = getHFLoadBalancer();
      lb.recordFailure(model, 'timeout');
      throw new Error(`Chat completion timed out on model ${model} (${CHAT_TIMEOUT_MS}ms)`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT WITH FALLBACK — The KEY Function
// ═══════════════════════════════════════════════════════════════════════

/**
 * Smart chat with automatic model fallback using the load balancer.
 *
 * Strategy:
 * 1. Try each preferred model in order, skipping those that are rate-limited or loading
 * 2. If a model returns a cold-start (503 loading), mark it and move to the next
 * 3. If a model returns a rate-limit (429), mark it and move to the next
 * 4. If all preferred models fail, pick from the same category as the first preferred model
 * 5. If no category fallback works, try any available model via the load balancer
 *
 * @param messages - Array of chat messages in OpenAI format
 * @param preferredModels - Ordered list of preferred model IDs to try
 * @param options - Optional generation parameters
 * @returns The response content and metadata about which model was used
 *
 * @example
 * ```ts
 * const result = await chatWithFallback(
 *   [{ role: 'user', content: 'Explain quantum computing' }],
 *   ['Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Llama-3.1-70B-Instruct'],
 *   { temperature: 0.7 }
 * );
 * console.log(`Used: ${result.modelUsed} (fallback: ${result.wasFallback})`);
 * console.log(result.content);
 * ```
 */
export async function chatWithFallback(
  messages: HFChatMessage[],
  preferredModels?: string[],
  options?: HFChatOptions
): Promise<HFChatFallbackResult> {
  // Ensure cache is fresh before attempting chat
  await ensureCache();

  const lb = getHFLoadBalancer();
  const startTime = Date.now();

  // Default preferred models if none specified — prioritize popular/reliable ones
  const preferred = preferredModels?.length
    ? preferredModels
    : [
        'meta-llama/Llama-3.1-8B-Instruct',
        'Qwen/Qwen2.5-7B-Instruct',
        'mistralai/Mistral-Small-24B-Instruct-2501',
        'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
        'Qwen/QwQ-32B',
      ];

  const triedModels: string[] = [];
  const excludeModels = new Set<string>();

  // ─── Phase 1: Try preferred models in order ───────────────────────
  for (const modelId of preferred) {
    // Skip models not in our registry
    if (!_cache.models[modelId]) {
      console.log(`[HF-Chat] Skipping unknown model: ${modelId}`);
      continue;
    }

    // Skip models the load balancer says are unusable
    if (!lb.isModelUsable(modelId)) {
      console.log(`[HF-Chat] Skipping unusable model: ${modelId}`);
      excludeModels.add(modelId);
      continue;
    }

    triedModels.push(modelId);

    try {
      const content = await generateHFChatCompletion(messages, modelId, options);
      const elapsed = Date.now() - startTime;

      return {
        content,
        modelUsed: modelId,
        wasFallback: false,
        attempts: triedModels.length,
        responseTimeMs: elapsed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[HF-Chat] Fallback: model ${modelId} failed: ${errorMsg.slice(0, 100)}`);
      excludeModels.add(modelId);
      // Continue to next preferred model
    }
  }

  // ─── Phase 2: Try same-category fallback ─────────────────────────
  // Determine the category from the first preferred model
  const firstPreferredModel = preferred.find((id) => _cache.models[id]);
  const fallbackCategory = firstPreferredModel
    ? _cache.models[firstPreferredModel]?.category
    : undefined;

  if (fallbackCategory) {
    console.log(`[HF-Chat] Trying category fallback: ${fallbackCategory}`);
    const categoryModels = _cache.categoryModelMap.get(fallbackCategory as HFChatCategory) ?? [];

    // Use load balancer to select best model from category
    const selection = lb.selectBestModel(categoryModels, {
      preferredModels: preferred,
      excludeModels: Array.from(excludeModels),
    });

    if (selection) {
      triedModels.push(selection.modelId);
      console.log(`[HF-Chat] Category fallback selected: ${selection.modelId} (${selection.reason})`);

      try {
        const content = await generateHFChatCompletion(messages, selection.modelId, options);
        const elapsed = Date.now() - startTime;

        return {
          content,
          modelUsed: selection.modelId,
          wasFallback: true,
          attempts: triedModels.length,
          responseTimeMs: elapsed,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[HF-Chat] Category fallback ${selection.modelId} failed: ${errorMsg.slice(0, 100)}`);
        excludeModels.add(selection.modelId);
      }
    }
  }

  // ─── Phase 3: Try any available model via load balancer ───────────
  console.log(`[HF-Chat] Trying global fallback from all models`);
  const allAvailable = _cache.modelIdList.filter((id) => _cache.models[id]?.available);

  const globalSelection = lb.selectBestModel(allAvailable, {
    preferredModels: preferred,
    excludeModels: Array.from(excludeModels),
    maxAttempts: MAX_FALLBACK_ATTEMPTS,
  });

  if (globalSelection) {
    triedModels.push(globalSelection.modelId);
    console.log(`[HF-Chat] Global fallback selected: ${globalSelection.modelId} (${globalSelection.reason})`);

    try {
      const content = await generateHFChatCompletion(messages, globalSelection.modelId, options);
      const elapsed = Date.now() - startTime;

      return {
        content,
        modelUsed: globalSelection.modelId,
        wasFallback: true,
        attempts: triedModels.length,
        responseTimeMs: elapsed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[HF-Chat] Global fallback ${globalSelection.modelId} failed: ${errorMsg.slice(0, 100)}`);
      excludeModels.add(globalSelection.modelId);
    }
  }

  // ─── Phase 4: All models exhausted — try remaining with retries ───
  // As a last resort, try a few more models we haven't tried yet
  const remainingModels = allAvailable.filter((id) => !excludeModels.has(id) && !triedModels.includes(id));

  for (const modelId of remainingModels.slice(0, 3)) {
    triedModels.push(modelId);
    console.log(`[HF-Chat] Last-resort fallback: ${modelId}`);

    try {
      const content = await generateHFChatCompletion(messages, modelId, options);
      const elapsed = Date.now() - startTime;

      return {
        content,
        modelUsed: modelId,
        wasFallback: true,
        attempts: triedModels.length,
        responseTimeMs: elapsed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[HF-Chat] Last-resort ${modelId} failed: ${errorMsg.slice(0, 100)}`);
    }
  }

  // ─── Complete failure ─────────────────────────────────────────────
  const elapsed = Date.now() - startTime;
  console.log(`[HF-Chat] All models exhausted after ${triedModels.length} attempts in ${elapsed}ms`);

  throw new Error(
    `All chat models failed after ${triedModels.length} attempts. ` +
    `Tried: ${triedModels.join(', ')}. ` +
    'Please try again later or reduce request frequency.'
  );
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════════════════════════════════

/** Total number of registered chat models (based on current cache) */
export function getHFChatModelCount(): number {
  return _cache.modelIdList.length;
}

/** Default model for chat completions */
export const HF_DEFAULT_CHAT_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

/** Recommended models for general chat (balanced quality/speed) */
export const HF_RECOMMENDED_CHAT_MODELS = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
  'mistralai/Mistral-Small-24B-Instruct-2501',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'Qwen/QwQ-32B',
] as const;

/** High-quality models for complex tasks */
export const HF_PREMIUM_CHAT_MODELS = [
  'meta-llama/Llama-3.1-70B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'deepseek-ai/DeepSeek-R1',
  'deepseek-ai/DeepSeek-V3',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'moonshotai/Kimi-K2-Instruct',
] as const;

/** Fast/lightweight models for quick responses */
export const HF_FAST_CHAT_MODELS = [
  'meta-llama/Llama-3.2-1B-Instruct',
  'Qwen/Qwen3-4B-Instruct-2507',
  'google/gemma-3n-E4B-it',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'Qwen/Qwen2.5-Coder-3B-Instruct',
] as const;

/** Code-focused models for programming tasks */
export const HF_CODE_CHAT_MODELS = [
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'deepseek-ai/DeepSeek-V3.1',
  'deepseek-ai/DeepSeek-V3.2',
] as const;

/** Reasoning/math models for analytical tasks */
export const HF_REASONING_CHAT_MODELS = [
  'deepseek-ai/DeepSeek-R1',
  'Qwen/QwQ-32B',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
  'deepseek-ai/DeepSeek-R1-0528',
] as const;

// ═══════════════════════════════════════════════════════════════════════
// BACKGROUND CACHE WARM-UP
// ═══════════════════════════════════════════════════════════════════════
// Kick off the first fetch in the background so the cache gets populated
// as soon as possible, without blocking module import.

ensureCache().catch((err) => {
  console.warn(`[HF-Chat] Background cache warm-up failed: ${err}`);
});
