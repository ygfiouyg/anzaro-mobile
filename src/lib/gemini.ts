// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Google Gemini AI Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides AI access via Google Generative AI (Gemini) API:
//   - Chat/text generation (Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash, etc.)
//   - Vision/image analysis (multimodal with inline image data)
//   - Image generation (Imagen 3 via Gemini's prediction API)
//
// Key advantage: Google AI Studio free tier provides generous usage
// of state-of-the-art Gemini models with a free API key.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceImage, traceError, traceAPI } from '@/lib/trace-logger';

// ─── API Key ────────────────────────────────────────────────────────────
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ─── API Base URL ──────────────────────────────────────────────────────
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ─── Default Timeouts ──────────────────────────────────────────────────
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const VISION_TIMEOUT_MS = 180_000;   // 3 min — vision analysis
const IMAGE_GEN_TIMEOUT_MS = 180_000; // 3 min — image generation

// ─── Default Retry Config ──────────────────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── Gemini Model IDs ─────────────────────────────────────────────────

export type GeminiModelId =
  | 'gemini-2.0-flash-001'
  | 'gemini-2.5-flash-preview-04-17'
  | 'gemini-2.5-flash-preview-05-20'
  | 'gemini-2.5-pro-preview-05-06'
  | 'gemini-2.0-flash-001'
  | 'gemini-2.0-flash-lite-001'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-pro';

// ─── Chat Types ────────────────────────────────────────────────────────

export interface GeminiChatMessage {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

export interface GeminiChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: GeminiModelId;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  /** Optional system instruction (injected as a system-level directive) */
  systemInstruction?: string;
}

export interface GeminiChatResponse {
  id: string;
  model: string;
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface GeminiChatStreamChunk {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string | null;
    index: number;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// ─── Vision Types ──────────────────────────────────────────────────────

export interface GeminiVisionRequest {
  prompt: string;
  /** Image as base64-encoded string (without the data URL prefix) */
  imageBase64: string;
  /** MIME type of the image (e.g., 'image/jpeg', 'image/png') */
  imageMimeType: string;
  model?: GeminiModelId;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiVisionResponse {
  id: string;
  model: string;
  text: string;
  finishReason: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

// ─── Image Generation Types ────────────────────────────────────────────

export interface GeminiImageGenRequest {
  prompt: string;
  /** Number of images to generate (1-4) */
  numberOfImages?: number;
  /** Aspect ratio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' */
  aspectRatio?: string;
}

export interface GeminiImageGenResponse {
  images: Array<{
    base64: string;
    mimeType: string;
  }>;
  model: string;
  prompt: string;
}

// ─── Model Mapping Types ───────────────────────────────────────────────

export interface GeminiModelMappingEntry {
  /** Gemini model ID to use */
  geminiModel: GeminiModelId;
  /** Human-readable label */
  label: string;
  /** Description of the model's strengths */
  description: string;
  /** Whether this model supports vision/multimodal input */
  supportsVision: boolean;
  /** Whether this model is available on free tier */
  freeTier: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → Gemini models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chat model mapping: DeltaAI frontend model IDs → Gemini models.
 *
 * Available Gemini models (as of 2025):
 *   gemini-2.0-flash               — Stable, fast, great for most tasks (recommended)
 *   gemini-2.0-flash-lite          — Lightweight, fastest responses
 *   gemini-1.5-flash               — Legacy fast
 *   gemini-1.5-pro                 — Legacy pro
 *
 * STRATEGY: Map DeltaAI frontend model IDs to the most appropriate Gemini
 * model based on the model's personality and specialization. Fast/quick
 * models map to flash/lite variants, while deep/advanced models map to pro.
 */
export const GEMINI_CHAT_MODEL_MAP: Record<string, GeminiModelMappingEntry> = {
  // ─── Global models ───
  'gpt-4o': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Latest Gemini 2.5 Flash — excellent all-rounder',
    supportsVision: true,
    freeTier: true,
  },
  'gemini-2': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Latest Gemini with thinking capabilities',
    supportsVision: true,
    freeTier: true,
  },
  'claude-3-5': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Pro-level nuanced analysis and careful reasoning',
    supportsVision: true,
    freeTier: true,
  },
  'llama-3': {
    geminiModel: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    description: 'Lightweight, fast and direct responses',
    supportsVision: true,
    freeTier: true,
  },
  'mistral-large': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Precise, multilingual, well-structured',
    supportsVision: true,
    freeTier: true,
  },
  'command-r-plus': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Deep technical reasoning and code analysis',
    supportsVision: true,
    freeTier: true,
  },

  // ─── New models ───
  'gemini-2.5-pro': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Most powerful AI model from Google with deep thinking',
    supportsVision: true,
    freeTier: true,
  },
  'gemini-2.5-flash': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Fastest smart model from Google with built-in thinking',
    supportsVision: true,
    freeTier: true,
  },

  // ─── Smart models ───
  'delta-ultra': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Most advanced Gemini model for deep insights',
    supportsVision: true,
    freeTier: true,
  },
  'delta-pro': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Professional-grade quality with depth',
    supportsVision: true,
    freeTier: true,
  },
  'delta-flash': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Fastest smart model from Google — Egyptian Arabic dialect',
    supportsVision: true,
    freeTier: true,
  },
  'delta-philosopher': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Deep philosophical reasoning and nuance',
    supportsVision: true,
    freeTier: true,
  },
  'delta-historian': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Historical accuracy and contextual analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-mathematician': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Step-by-step mathematical reasoning',
    supportsVision: true,
    freeTier: true,
  },
  'delta-strategist': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Strategic analysis and multi-step planning',
    supportsVision: true,
    freeTier: true,
  },

  // ─── Creative models ───
  'delta-creative': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Creative and imaginative responses',
    supportsVision: true,
    freeTier: true,
  },
  'delta-poet': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Lyrical and poetic expression',
    supportsVision: true,
    freeTier: true,
  },
  'delta-comedian': {
    geminiModel: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Witty and humorous responses',
    supportsVision: true,
    freeTier: true,
  },
  'delta-artist': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Visual creativity and art analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-musician': {
    geminiModel: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Musical theory and composition',
    supportsVision: true,
    freeTier: true,
  },

  // ─── Specialized models ───
  'delta-vision': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Advanced visual analysis and description',
    supportsVision: true,
    freeTier: true,
  },
  'delta-code': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Code generation and technical analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-islamic': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Islamic studies with scholarly depth',
    supportsVision: true,
    freeTier: true,
  },
  'delta-egyptian': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Egyptian culture and history expertise in Egyptian Arabic',
    supportsVision: true,
    freeTier: true,
  },
  'delta-analyst': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Data analysis and pattern recognition',
    supportsVision: true,
    freeTier: true,
  },
  'delta-teacher': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Clear explanations and educational guidance',
    supportsVision: true,
    freeTier: true,
  },
  'delta-motivator': {
    geminiModel: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Inspiring and encouraging responses',
    supportsVision: true,
    freeTier: true,
  },
  'delta-linguist': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Translation and linguistic analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-diplomat': {
    geminiModel: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Tactful and balanced communication',
    supportsVision: true,
    freeTier: true,
  },
  'delta-guardian': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Safety-focused and responsible guidance',
    supportsVision: true,
    freeTier: true,
  },

  // ─── Professional models ───
  'delta-research': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Research-grade depth and accuracy',
    supportsVision: true,
    freeTier: true,
  },
  'delta-doctor': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Medical knowledge and clinical analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-psychology': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Psychological insight and analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-personality': {
    geminiModel: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Personality analysis and character insight',
    supportsVision: true,
    freeTier: true,
  },
  'delta-fargh': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Islamic jurisprudence with scholarly depth',
    supportsVision: true,
    freeTier: true,
  },
  'delta-pharmacy': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Pharmaceutical and molecular analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-law': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Legal reasoning and formal analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-engineering': {
    geminiModel: 'gemini-2.5-pro-preview-05-06',
    label: 'Gemini 2.5 Pro',
    description: 'Engineering and technical problem-solving',
    supportsVision: true,
    freeTier: true,
  },
  'delta-business': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Business analysis and corporate strategy',
    supportsVision: true,
    freeTier: true,
  },
  'delta-translation': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'High-quality multilingual translation',
    supportsVision: true,
    freeTier: true,
  },
  'delta-history': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Historical narrative and analysis',
    supportsVision: true,
    freeTier: true,
  },
  'delta-art': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Art analysis and creative insight',
    supportsVision: true,
    freeTier: true,
  },
  'delta-cybersecurity': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.5 Flash',
    description: 'Cybersecurity analysis and threat assessment',
    supportsVision: true,
    freeTier: true,
  },
  'delta-skills': {
    geminiModel: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Practical skills and tutorial guidance',
    supportsVision: true,
    freeTier: true,
  },

  // ─── Dark / Uncensored models (use same Gemini backend) ───
  'delta-worm': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    description: 'Uncensored model — WhiteRabbitNeo-inspired for cybersecurity',
    supportsVision: true,
    freeTier: true,
  },
  'delta-fraud': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    description: 'Uncensored model — Dolphin-inspired for unrestricted analysis',
    supportsVision: true,
    freeTier: true,
  },
  'deepseek-v3': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    description: 'DeepSeek V3 style deep analysis',
    supportsVision: true,
    freeTier: true,
  },
  'qwen-2-5': {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    description: 'Qwen 2.5 style fast multilingual response',
    supportsVision: true,
    freeTier: true,
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
  return `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Convert OpenAI-style messages to Gemini format.
 * Gemini uses "user" and "model" roles (not "assistant" and "system").
 * System messages are handled via the systemInstruction parameter.
 */
function convertMessagesToGeminiFormat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  systemInstruction?: string
): { contents: GeminiChatMessage[]; systemInstructionText: string | undefined } {
  const contents: GeminiChatMessage[] = [];
  let systemInstructionText = systemInstruction;

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Accumulate system messages into the systemInstruction
      systemInstructionText = systemInstructionText
        ? `${systemInstructionText}\n\n${msg.content}`
        : msg.content;
    } else if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    } else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }],
      });
    }
  }

  return { contents, systemInstructionText };
}

/**
 * Build the request body for Gemini generateContent API.
 */
function buildRequestBody(
  contents: GeminiChatMessage[],
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    systemInstruction?: string;
  }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents,
  };

  // System instruction (Gemini's way of handling system prompts)
  if (options.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  // Generation config
  const generationConfig: Record<string, unknown> = {};
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  if (options.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = options.maxOutputTokens;
  if (options.topP !== undefined) generationConfig.topP = options.topP;
  if (options.topK !== undefined) generationConfig.topK = options.topK;

  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  // Safety settings — set to balanced to avoid over-filtering
  body.safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
  ];

  return body;
}

/**
 * Check if an error indicates content was filtered by safety settings.
 */
export function isGeminiContentFilterError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('blocked') ||
      msg.includes('safety') ||
      msg.includes('content_filter') ||
      msg.includes('finishreason') && msg.includes('safety')
    );
  }
  return false;
}

/**
 * Check if a response was blocked by safety filters.
 */
function isResponseBlocked(response: GeminiChatResponse): boolean {
  if (!response.candidates || response.candidates.length === 0) return true;
  const candidate = response.candidates[0];
  return candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST';
}

/**
 * Extract text from a Gemini response.
 */
function extractTextFromResponse(response: GeminiChatResponse): string {
  if (!response.candidates || response.candidates.length === 0) {
    return '';
  }
  const parts = response.candidates[0].content?.parts;
  if (!parts || parts.length === 0) return '';
  return parts.map((p) => p.text || '').join('');
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the Gemini model mapping for a given DeltaAI frontend model ID.
 * Returns a default mapping (Gemini 2.5 Flash) if the model is not found.
 */
export function getGeminiChatModelMapping(modelId?: string): GeminiModelMappingEntry {
  if (modelId && GEMINI_CHAT_MODEL_MAP[modelId]) {
    return GEMINI_CHAT_MODEL_MAP[modelId];
  }
  // Default to Gemini 2.0 Flash 001 (stable) for unknown models
  // Gemini 2.5 Flash preview models may be deprecated over time
  return {
    geminiModel: 'gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    description: 'Default stable model',
    supportsVision: true,
    freeTier: true,
  };
}

/**
 * Check if a given model ID is a Gemini model (exists in the mapping).
 */
export function isGeminiChatModel(modelId: string): boolean {
  return modelId in GEMINI_CHAT_MODEL_MAP;
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Non-Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a chat completion using Google Gemini API.
 *
 * Endpoint: POST /v1beta/models/{model}:generateContent?key={API_KEY}
 */
export async function generateGeminiChat(
  request: GeminiChatRequest
): Promise<GeminiChatResponse> {
  const {
    messages,
    model = 'gemini-2.0-flash',
    temperature = 0.7,
    maxOutputTokens = 8192,
    topP,
    topK,
    systemInstruction,
  } = request;

  const { contents, systemInstructionText } = convertMessagesToGeminiFormat(
    messages,
    systemInstruction
  );

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

  const body = buildRequestBody(contents, {
    temperature,
    maxOutputTokens,
    topP,
    topK,
    systemInstruction: systemInstructionText,
  });

  traceAPI(`[Gemini] Chat completion: model=${model}, messages=${contents.length}`);

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errMsg = errorText.slice(0, 300);

        // Handle specific error codes
        if (response.status === 429) {
          traceError(`[Gemini] Rate limited (429), retry ${retry + 1}/${MAX_RETRIES}`);
          if (retry < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (retry + 1)); // Exponential backoff
            continue;
          }
        }

        throw new Error(`Gemini API error ${response.status}: ${errMsg}`);
      }

      const result = (await response.json()) as GeminiChatResponse;

      // Check if response was blocked by safety filters
      if (isResponseBlocked(result)) {
        traceError(`[Gemini] Response blocked by safety filters`);
        throw new Error('Gemini response blocked by safety filters');
      }

      const text = extractTextFromResponse(result);
      traceAPI(`[Gemini] Chat completion success: model=${model}, tokens=${result.usageMetadata?.totalTokenCount ?? 'unknown'}, text_len=${text.length}`);

      return { ...result, id: generateId() };
    } catch (chatError) {
      lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
      traceAPI(`[Gemini] Chat attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isGeminiContentFilterError(chatError)) break;
      if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[Gemini] Chat completion failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('Gemini chat completion failed');
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT COMPLETION (Streaming)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a streaming chat completion using Google Gemini API.
 * Returns an async generator that yields SSE chunks.
 *
 * Endpoint: POST /v1beta/models/{model}:streamGenerateContent?alt=sse&key={API_KEY}
 *
 * Google returns SSE events like:
 *   data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
 */
export async function* streamGeminiChat(
  request: GeminiChatRequest
): AsyncGenerator<GeminiChatStreamChunk, void, unknown> {
  const {
    messages,
    model = 'gemini-2.0-flash',
    temperature = 0.7,
    maxOutputTokens = 8192,
    topP,
    topK,
    systemInstruction,
  } = request;

  const { contents, systemInstructionText } = convertMessagesToGeminiFormat(
    messages,
    systemInstruction
  );

  const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`;

  const body = buildRequestBody(contents, {
    temperature,
    maxOutputTokens,
    topP,
    topK,
    systemInstruction: systemInstructionText,
  });

  traceAPI(`[Gemini] Streaming chat: model=${model}, messages=${contents.length}`);

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    traceError(`[Gemini] Streaming fetch failed: ${errMsg.slice(0, 100)}`);
    throw fetchError;
  }

  if (!response.ok) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorText = await response.text().catch(() => '');
    traceError(`[Gemini] Streaming chat error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(`Gemini streaming error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const resBody = response.body as ReadableStream<Uint8Array> | null;
  if (!resBody) {
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error('No response body for Gemini streaming');
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
          const chunk = JSON.parse(dataStr) as GeminiChatStreamChunk;

          // Check if chunk was blocked by safety
          if (
            chunk.candidates &&
            chunk.candidates.length > 0 &&
            chunk.candidates[0].finishReason === 'SAFETY'
          ) {
            traceError(`[Gemini] Streaming response blocked by safety filters`);
            return;
          }

          // Extract text for logging
          if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
            totalText += chunk.candidates[0].content.parts[0].text;
          }

          yield chunk;
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }

    traceAPI(`[Gemini] Streaming chat complete: model=${model}, text_len=${totalText.length}`);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// VISION / IMAGE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Analyze an image using Gemini's multimodal capabilities.
 *
 * Endpoint: POST /v1beta/models/{model}:generateContent?key={API_KEY}
 * The request body includes inlineData with the image.
 */
export async function generateGeminiVision(
  request: GeminiVisionRequest
): Promise<GeminiVisionResponse> {
  const {
    prompt,
    imageBase64,
    imageMimeType,
    model = 'gemini-2.0-flash',
    temperature = 0.4,
    maxOutputTokens = 4096,
  } = request;

  // Build the content with both text and image
  const contents: GeminiChatMessage[] = [
    {
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64,
          },
        },
      ],
    },
  ];

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

  const body = buildRequestBody(contents, {
    temperature,
    maxOutputTokens,
  });

  traceImage(`[Gemini] Vision analysis: model=${model}, mime=${imageMimeType}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Gemini vision error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = (await response.json()) as GeminiChatResponse;

    if (isResponseBlocked(result)) {
      traceError(`[Gemini] Vision response blocked by safety filters`);
      throw new Error('Gemini vision response blocked by safety filters');
    }

    const text = extractTextFromResponse(result);
    const finishReason = result.candidates?.[0]?.finishReason ?? 'UNKNOWN';

    traceImage(`[Gemini] Vision analysis success: model=${model}, text_len=${text.length}`);

    return {
      id: generateId(),
      model,
      text,
      finishReason,
      safetyRatings: result.candidates?.[0]?.safetyRatings,
    };
  } catch (visionError) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = visionError instanceof Error ? visionError.message : String(visionError);
    traceError(`[Gemini] Vision analysis failed: ${errMsg.slice(0, 100)}`);
    throw visionError;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// IMAGE GENERATION (Imagen via Gemini)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate images using Gemini's Imagen model.
 *
 * Endpoint: POST /v1beta/models/imagen-3.0-generate-002:predict?key={API_KEY}
 *
 * Note: Imagen availability depends on your API key's region and quota.
 * This may fail with 404 if Imagen is not enabled for your key.
 */
export async function generateGeminiImage(
  request: GeminiImageGenRequest
): Promise<GeminiImageGenResponse> {
  const {
    prompt,
    numberOfImages = 1,
    aspectRatio = '1:1',
  } = request;

  const model = 'imagen-3.0-generate-002';
  const url = `${GEMINI_API_BASE}/models/${model}:predict`;

  const body = {
    instances: [
      { prompt },
    ],
    parameters: {
      sampleCount: numberOfImages,
      aspectRatio,
    },
  };

  traceImage(`[Gemini] Image generation: prompt="${prompt.slice(0, 50)}...", n=${numberOfImages}, ratio=${aspectRatio}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const errMsg = errorText.slice(0, 300);

      if (response.status === 404) {
        traceError(`[Gemini] Imagen model not available (404). Key may not have Imagen access.`);
        throw new Error('Imagen image generation is not available for this API key. The model may not be enabled in your region or plan.');
      }

      throw new Error(`Gemini image generation error ${response.status}: ${errMsg}`);
    }

    const result = await response.json() as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
    };

    if (!result.predictions || result.predictions.length === 0) {
      throw new Error('Gemini image generation returned no predictions');
    }

    const images = result.predictions
      .filter((p) => p.bytesBase64Encoded)
      .map((p) => ({
        base64: p.bytesBase64Encoded!,
        mimeType: p.mimeType || 'image/png',
      }));

    traceImage(`[Gemini] Image generation success: ${images.length} image(s) generated`);

    return {
      images,
      model,
      prompt,
    };
  } catch (imageError) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = imageError instanceof Error ? imageError.message : String(imageError);
    traceError(`[Gemini] Image generation failed: ${errMsg.slice(0, 100)}`);
    throw imageError;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY: Convert Gemini response to OpenAI-compatible format
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert a Gemini non-streaming response to an OpenAI-compatible format.
 * This is useful for API routes that need to return a consistent format.
 */
export function convertGeminiToOpenAIFormat(
  geminiResponse: GeminiChatResponse,
  model: string
): {
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
} {
  const text = extractTextFromResponse(geminiResponse);
  const finishReason = geminiResponse.candidates?.[0]?.finishReason ?? 'stop';

  return {
    id: geminiResponse.id || generateId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text,
        },
        finish_reason: finishReason === 'STOP' ? 'stop' : finishReason.toLowerCase(),
      },
    ],
    usage: {
      prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: geminiResponse.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

/**
 * Convert a Gemini streaming chunk to an OpenAI-compatible streaming chunk.
 */
export function convertGeminiChunkToOpenAIFormat(
  geminiChunk: GeminiChatStreamChunk,
  model: string,
  chunkId: string
): {
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
} {
  const text = geminiChunk.candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = geminiChunk.candidates?.[0]?.finishReason;

  return {
    id: chunkId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          ...(text ? { content: text } : {}),
        },
        finish_reason: finishReason
          ? finishReason === 'STOP' ? 'stop' : finishReason.toLowerCase()
          : null,
      },
    ],
  };
}
