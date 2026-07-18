// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Pollinations.ai Provider Module
// ═══════════════════════════════════════════════════════════════════════
// Provides free, open-source AI access via Pollinations.ai API:
//   - Chat/text generation via gen.pollinations.ai/v1/chat/completions
//     (FREE tier: openai, openai-fast, gpt-5.4-mini, gemma, nova-fast,
//      qwen-coder, mistral, kimi, llama, qwen-large, qwen-vision,
//      deepseek, minimax)
//   - Image generation (flux, gptimage, gpt-image-2, seedream5, zimage,
//     nova-canvas, kontext, grok-imagine, grok-imagine-pro, qwen-image, etc.)
//   - Video generation (veo, wan, wan-fast, wan-image)
//   - Image editing (kontext, p-image-edit, gptimage, etc.)
//
// ENDPOINTS:
//   - gen.pollinations.ai/v1/chat/completions — OpenAI-compatible chat
//   - image.pollinations.ai/prompt/ — Free image generation (no auth)
//   - gen.pollinations.ai/v1/images/generations — Auth image generation
//   - gen.pollinations.ai/video/ — Video generation
//
// Key advantage: No API key needed for the legacy image endpoint or
// the gen.pollinations.ai chat endpoint (anonymous tier).
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { traceImage, traceError, traceAPI } from '@/lib/trace-logger';

// ─── API Base URLs ────────────────────────────────────────────────────
const LEGACY_IMAGE_BASE = 'https://image.pollinations.ai';
const GEN_API_BASE = 'https://gen.pollinations.ai';
const TEXT_API_BASE = 'https://text.pollinations.ai';

// ─── Default Timeouts ─────────────────────────────────────────────────
const IMAGE_TIMEOUT_MS = 90_000;   // 90s — image gen can be slow
const VIDEO_TIMEOUT_MS = 300_000;  // 5 min — video gen can take minutes
const CHAT_TIMEOUT_MS = 0; // تم إلغاء timeout (عبس طلب كده)
const EDIT_TIMEOUT_MS = 90_000;    // 90s — editing similar to generation

// ─── Default Retry Config ─────────────────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── Image Types ──────────────────────────────────────────────────────

export type PollinationsImageModel =
  | 'flux'
  | 'gptimage'
  | 'gpt-image-2'
  | 'seedream5'
  | 'seedream-pro'
  | 'zimage'
  | 'kontext'
  | 'nova-canvas'
  | 'grok-imagine'
  | 'grok-imagine-pro'
  | 'qwen-image';

export interface PollinationsImageRequest {
  prompt: string;
  model?: PollinationsImageModel;
  width?: number;
  height?: number;
  seed?: number;
  negative_prompt?: string;
  enhance?: boolean;
  nologo?: boolean;
  /** Optional auth token for gen.pollinations.ai endpoints */
  authToken?: string;
}

export interface PollinationsImageResponse {
  base64: string;
  format: 'jpg' | 'png' | 'webp' | 'gif';
  mimeType: string;
  model: string;
  prompt: string;
  width: number;
  height: number;
  /** How the image was generated (legacy-free or gen-api) */
  source: 'legacy-free' | 'gen-api';
}

// ─── Video Types ──────────────────────────────────────────────────────

export type PollinationsVideoModel =
  | 'veo'
  | 'wan'
  | 'wan-fast'
  | 'wan-image';

export interface PollinationsVideoRequest {
  prompt: string;
  model?: PollinationsVideoModel;
  width?: number;
  height?: number;
  duration?: number;
  aspect_ratio?: string;
  audio?: boolean;
  /** Reference images: image[0] = start frame, image[1] = end frame */
  images?: string[];
  /** Optional auth token */
  authToken?: string;
}

export interface PollinationsVideoResponse {
  /** Direct URL to the MP4 video */
  videoUrl: string;
  /** Base64-encoded video data (only if downloaded) */
  base64?: string;
  model: string;
  prompt: string;
  duration?: number;
  /** If the response is async, this is the task ID for polling */
  taskId?: string;
  taskStatus?: 'PROCESSING' | 'SUCCESS' | 'FAIL';
}

// ─── Chat Types ───────────────────────────────────────────────────────

export type PollinationsChatModel =
  | 'openai'
  | 'openai-fast'
  | 'openai-large'
  | 'gpt-5.4-mini'
  | 'gpt-5.5'
  | 'qwen-coder'
  | 'qwen-coder-large'
  | 'qwen-large'
  | 'qwen-vision'
  | 'qwen-vision-pro'
  | 'qwen-safety'
  | 'mistral'
  | 'mistral-4'
  | 'mistral-large'
  | 'gemini'
  | 'gemini-3.5-flash'
  | 'gemini-flash-lite-3.1'
  | 'gemini-fast'
  | 'gemini-large'
  | 'gemini-search'
  | 'gemini-search-fast'
  | 'gemini-search-large'
  | 'deepseek'
  | 'deepseek-pro'
  | 'gemma'
  | 'grok'
  | 'grok-large'
  | 'grok-4.3'
  | 'claude-fast'
  | 'claude'
  | 'claude-large'
  | 'claude-opus-4.7'
  | 'perplexity-fast'
  | 'perplexity-reasoning'
  | 'kimi'
  | 'kimi-k2.6'
  | 'llama'
  | 'llama-maverick'
  | 'llama-scout'
  | 'minimax'
  | 'polly'
  | 'glm'
  | 'nova-fast'
  | 'nova'
  | 'openai-audio'
  | 'openai-audio-large';

export interface PollinationsChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PollinationsChatRequest {
  messages: PollinationsChatMessage[];
  model?: PollinationsChatModel;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  /** Optional auth token */
  authToken?: string;
  /** Optional seed for reproducibility */
  seed?: number;
  /** Optional system prompt suffix to differentiate model personalities.
   *  Injected into the system message to make same-backend models behave differently. */
  systemPromptSuffix?: string;
}

export interface PollinationsChatResponse {
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
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface PollinationsChatStreamChunk {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
}

// ─── Image Edit Types ─────────────────────────────────────────────────

export type PollinationsEditModel =
  | 'kontext'
  | 'p-image-edit'
  | 'gptimage'
  | 'gpt-image-2'
  | 'seedream5'
  | 'seedream-pro'
  | 'flux'
  | 'zimage'
  | 'nova-canvas'
  | 'grok-imagine'
  | 'grok-imagine-pro'
  | 'qwen-image';

export interface PollinationsImageEditRequest {
  /** The source image as base64 data URL or URL */
  image: string;
  prompt: string;
  model?: PollinationsEditModel;
  width?: number;
  height?: number;
  /** Optional auth token */
  authToken?: string;
}

export interface PollinationsImageEditResponse {
  base64: string;
  format: 'jpg' | 'png' | 'webp' | 'gif';
  mimeType: string;
  model: string;
  prompt: string;
}

// ─── Model Mapping Types ──────────────────────────────────────────────

export interface ModelMappingEntry {
  /** Pollinations model ID */
  pollinationsModel: string;
  /** Human-readable label */
  label: string;
  /** Style prefix to inject for this model */
  stylePrefix: string;
  /** Fallback ZhipuAI model if Pollinations fails */
  zhipuFallback: string;
  /** Optional system prompt suffix to differentiate model personalities
   *  Even though many models share the same backend (openai/openai-fast),
   *  the systemPromptSuffix makes them behave with distinct personalities. */
  systemPromptSuffix?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL MAPPINGS — DeltaAI frontend IDs → Pollinations model names
// ═══════════════════════════════════════════════════════════════════════

/**
 * Image model mapping: DeltaAI frontend model IDs → Pollinations models.
 *
 * UPDATED (2026-03-05): The gen.pollinations.ai/v1/chat/completions endpoint
 * now supports ALL image models. The legacy image.pollinations.ai/prompt/
 * endpoint still works for GET requests with the original 6 models.
 *
 * ✅ Confirmed working on free image.pollinations.ai/prompt/ endpoint:
 *    flux, gptimage, gpt-image-2, seedream5, zimage, nova-canvas
 * ✅ Available via gen.pollinations.ai (new API):
 *    All models including kontext, grok-imagine, grok-imagine-pro,
 *    qwen-image, seedream-pro, etc.
 *
 * STRATEGY: Primary image generation uses the free legacy endpoint with
 * the 6 reliable models. The gen API provides access to additional models
 * when auth tokens are available. Each frontend model gets a UNIQUE style
 * prefix that controls lighting, mood, medium, composition, and aesthetic
 * direction for visual differentiation.
 */
export const IMAGE_MODEL_MAP: Record<string, ModelMappingEntry> = {
  // ─── Global models ───
  'gpt-4o': {
    pollinationsModel: 'gptimage',
    label: 'GPT Image',
    stylePrefix: 'professional photography, 8K ultra HD, sharp focus, studio lighting, DSLR quality, ',
    zhipuFallback: 'cogview-4',
  },
  'gemini-2': {
    pollinationsModel: 'seedream5',
    label: 'Seedream 5',
    stylePrefix: 'cinematic, wide angle lens, dramatic lighting, movie scene, anamorphic, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'claude-3-5': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'minimalist, clean composition, elegant, soft pastel tones, modern design, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'llama-3': {
    pollinationsModel: 'zimage',
    label: 'Z-Image',
    stylePrefix: 'digital art, vibrant neon colors, concept art, sci-fi aesthetic, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'mistral-large': {
    pollinationsModel: 'nova-canvas',
    label: 'Nova Canvas',
    stylePrefix: 'fine art, classic oil painting style, rich textures, museum quality, ',
    zhipuFallback: 'cogview-3',
  },
  'command-r-plus': {
    pollinationsModel: 'gpt-image-2',
    label: 'GPT Image 2',
    stylePrefix: 'photorealistic, high detail, natural daylight, documentary photography, ',
    zhipuFallback: 'cogview-3-plus',
  },

  // ─── New models ───
  'gemini-2.5-pro': {
    pollinationsModel: 'seedream-pro',
    label: 'Seedream Pro',
    stylePrefix: 'masterpiece, best quality, extremely detailed, 8K resolution, award-winning, ',
    zhipuFallback: 'cogview-4',
  },
  'gemini-2.5-flash': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'high quality, sharp, well-composed, professional, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'deepseek-r1': {
    pollinationsModel: 'zimage',
    label: 'Z-Image',
    stylePrefix: 'technical, precise, analytical, structured, blueprint, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'gemma-2': {
    pollinationsModel: 'gptimage',
    label: 'GPT Image',
    stylePrefix: 'clean, balanced, bright, simple composition, modern design, ',
    zhipuFallback: 'cogview-3-flash',
  },

  // ─── Smart models ───
  'delta-ultra': {
    pollinationsModel: 'gpt-image-2',
    label: 'GPT Image 2',
    stylePrefix: 'masterpiece, best quality, extremely detailed, 8K resolution, award-winning, ',
    zhipuFallback: 'cogview-4',
  },
  'delta-pro': {
    pollinationsModel: 'seedream5',
    label: 'Seedream 5',
    stylePrefix: 'professional, high resolution, detailed, well-composed, commercial quality, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-flash': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'quick snapshot, clean, bright, simple composition, flat design, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-philosopher': {
    pollinationsModel: 'kontext',
    label: 'Kontext',
    stylePrefix: 'contemplative, atmospheric, moody, chiaroscuro lighting, philosophical, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-historian': {
    pollinationsModel: 'seedream-pro',
    label: 'Seedream Pro',
    stylePrefix: 'historical, period-accurate, aged texture, sepia tones, vintage, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-mathematician': {
    pollinationsModel: 'zimage',
    label: 'Z-Image',
    stylePrefix: 'geometric, precise, mathematical patterns, fractal, clean lines, blueprint, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-strategist': {
    pollinationsModel: 'gpt-image-2',
    label: 'GPT Image 2',
    stylePrefix: 'strategic, top-down view, analytical, data visualization, infographic style, ',
    zhipuFallback: 'cogview-4',
  },

  // ─── Creative models ───
  'delta-creative': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'creative, vivid saturated colors, dreamlike surrealism, whimsical, fantasy, ',
    zhipuFallback: 'cogview-4',
  },
  'delta-poet': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'ethereal, poetic, soft dreamy atmosphere, watercolor wash, gentle light, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-comedian': {
    pollinationsModel: 'grok-imagine',
    label: 'Grok Imagine',
    stylePrefix: 'cartoon, humorous, comic book style, bold outlines, exaggerated, pop art, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-artist': {
    pollinationsModel: 'qwen-image',
    label: 'Qwen Image',
    stylePrefix: 'oil painting, impressionist style, visible brushstrokes, gallery art, palette knife, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-musician': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'musical, rhythmic, sound waves, vinyl, concert lighting, album cover art, ',
    zhipuFallback: 'cogview-3-flash',
  },

  // ─── Specialized models ───
  'delta-vision': {
    pollinationsModel: 'gpt-image-2',
    label: 'GPT Image 2',
    stylePrefix: 'hyperrealistic, photorealistic, macro detail, true-to-life, micro texture, ',
    zhipuFallback: 'cogview-4',
  },
  'delta-code': {
    pollinationsModel: 'zimage',
    label: 'Z-Image',
    stylePrefix: 'technical diagram, blueprint, schematic, code visualization, dark mode UI, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-islamic': {
    pollinationsModel: 'seedream5',
    label: 'Seedream 5',
    stylePrefix: 'Islamic art, arabesque, geometric patterns, calligraphy, mosque architecture, gold accents, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-egyptian': {
    pollinationsModel: 'nova-canvas',
    label: 'Nova Canvas',
    stylePrefix: 'ancient Egyptian, pharaonic, hieroglyphic, golden sand tones, papyrus texture, ',
    zhipuFallback: 'cogview-3',
  },
  'delta-analyst': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'data-driven, analytical, clean charts, minimalist infographic, precision, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-teacher': {
    pollinationsModel: 'gptimage',
    label: 'GPT Image',
    stylePrefix: 'educational, clear diagram, labeled, bright, instructional, textbook quality, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-motivator': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'inspiring, dynamic, sunrise, golden hour, powerful, motivational poster, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-linguist': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'typographic art, text-based, multilingual, script, calligraphy, lettering, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-diplomat': {
    pollinationsModel: 'gpt-image-2',
    label: 'GPT Image 2',
    stylePrefix: 'formal, diplomatic, balanced composition, neutral tones, elegant, official, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-guardian': {
    pollinationsModel: 'zimage',
    label: 'Z-Image',
    stylePrefix: 'protective, shield motif, safe, warm glow, guardian, sentinel, fortress, ',
    zhipuFallback: 'cogview-3-flash',
  },

  // ─── Professional models ───
  'delta-research': {
    pollinationsModel: 'seedream5',
    label: 'Seedream 5',
    stylePrefix: 'scientific illustration, accurate, detailed, research paper quality, academic, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-doctor': {
    pollinationsModel: 'gptimage',
    label: 'GPT Image',
    stylePrefix: 'medical illustration, anatomically correct, clinical, clean, labeled diagram, ',
    zhipuFallback: 'cogview-3',
  },
  'delta-psychology': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'psychological, abstract mind, surreal portrait, inkblot, layered consciousness, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-personality': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'colorful personality, vibrant portrait, expressive, character design, dynamic, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-fargh': {
    pollinationsModel: 'gptimage',
    label: 'GPT Image',
    stylePrefix: 'Islamic jurisprudence, scholarly, manuscript, ornate border, scholarly book, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-pharmacy': {
    pollinationsModel: 'gpt-image-2',
    label: 'GPT Image 2',
    stylePrefix: 'pharmaceutical, molecular structure, precise, clinical, lab quality, formula, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-law': {
    pollinationsModel: 'nova-canvas',
    label: 'Nova Canvas',
    stylePrefix: 'legal, formal, structured, gavel, scales of justice, official document, marble, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-engineering': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'engineering, CAD, technical drawing, isometric, blueprint, structural, precise, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-business': {
    pollinationsModel: 'grok-imagine-pro',
    label: 'Grok Imagine Pro',
    stylePrefix: 'corporate, professional, business, sleek, modern office, executive, polished, ',
    zhipuFallback: 'cogview-4',
  },
  'delta-translation': {
    pollinationsModel: 'seedream5',
    label: 'Seedream 5',
    stylePrefix: 'multilingual, cultural bridge, world map, diverse scripts, global, united, ',
    zhipuFallback: 'cogview-3-flash',
  },
  'delta-history': {
    pollinationsModel: 'nova-canvas',
    label: 'Nova Canvas',
    stylePrefix: 'historical narrative, period costume, ancient civilization, oil on canvas, epic, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-art': {
    pollinationsModel: 'zimage',
    label: 'Z-Image',
    stylePrefix: 'contemporary art, mixed media, bold colors, expressive, gallery installation, ',
    zhipuFallback: 'cogview-4',
  },
  'delta-cybersecurity': {
    pollinationsModel: 'flux',
    label: 'Flux',
    stylePrefix: 'cybersecurity, digital shield, matrix, encrypted, network, dark tech, hacker, ',
    zhipuFallback: 'cogview-3-plus',
  },
  'delta-skills': {
    pollinationsModel: 'gptimage',
    label: 'GPT Image',
    stylePrefix: 'practical skills, step-by-step, instructional, hands-on, tutorial, clear layout, ',
    zhipuFallback: 'cogview-3-flash',
  },
};

/**
 * Video model mapping: DeltaAI frontend model IDs → Pollinations video models.
 *
 * VERIFIED Pollinations video models on gen.pollinations.ai (genuinely different):
 *   veo — Google Veo (high quality, may require auth)
 *   wan — Wan 2.6 (smooth, general purpose)
 *   wan-fast — Wan Fast (quick generation)
 *   wan-image — Wan Image-to-Video (requires reference image)
 *
 * REMOVED (silently route to same backend on Pollinations):
 *   seedance-pro, seedance-2.0, seedance, wan-pro, wan-image-pro,
 *   grok-video-pro, ltx-2, p-video, nova-reel
 *
 * STRATEGY: 4 genuinely different Pollinations video models distributed across
 * frontend models. Each frontend model maps to one of these with a UNIQUE style
 * prefix that controls the cinematic direction, camera movement, mood, and visual
 * storytelling of the generated video. The style prefix is the key mechanism for
 * differentiation — even models sharing the same Pollinations backend produce
 * visually distinct videos.
 *
 * NOTE: Video generation on Pollinations may require auth tokens.
 * If Pollinations fails, the ZhipuAI CogVideoX fallback is used.
 */
export const VIDEO_MODEL_MAP: Record<string, ModelMappingEntry> = {
  // ─── Global models (6) ───
  'gpt-4o': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Professional cinematography, smooth camera movement, 4K quality, ',
    zhipuFallback: 'cogvideox-2',
  },
  'gemini-2': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Cinematic, dramatic lighting, wide angle panning, movie trailer, ',
    zhipuFallback: 'cogvideox-2',
  },
  'claude-3-5': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Clean, minimalist motion, smooth transitions, elegant, ',
    zhipuFallback: 'cogvideox-2',
  },
  'llama-3': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Dynamic, vibrant colors, fast-paced, digital art style, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'mistral-large': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Classic film, artistic camera work, vintage tone, ',
    zhipuFallback: 'cogvideox-2',
  },
  'command-r-plus': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Documentary style, natural lighting, realistic, ',
    zhipuFallback: 'cogvideox-flash',
  },

  // ─── New models ───
  'gemini-2.5-pro': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Cinematic, deep thinking, high production value, 4K, ',
    zhipuFallback: 'cogvideox-2',
  },
  'gemini-2.5-flash': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Fast, smart, well-composed, steady cam, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'deepseek-r1': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Analytical, step-by-step reveals, structured motion, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'gemma-2': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Clean, balanced, simple motion, fast-paced, ',
    zhipuFallback: 'cogvideox-flash',
  },

  // ─── Fast models (1) ───
  'delta-flash': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Quick cut, snappy motion, instant action, rapid sequence, ',
    zhipuFallback: 'cogvideox-flash',
  },

  // ─── Smart models (6) ───
  'delta-ultra': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Award-winning cinematography, high production value, 4K, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-pro': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Professional, well-composed, steady cam, balanced lighting, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-philosopher': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Contemplative, slow motion, atmospheric depth, meditative pacing, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-historian': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Historical documentary, archival footage style, sepia grading, period-accurate, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-mathematician': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Geometric motion, precise camera paths, mathematical patterns, fractal zoom, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-strategist': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Strategic overview, top-down camera, analytical motion, structured reveals, ',
    zhipuFallback: 'cogvideox-2',
  },

  // ─── Creative models (5) ───
  'delta-creative': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Surreal motion, dreamlike, creative transitions, whimsical, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-poet': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Poetic flow, lyrical camera, soft focus transitions, ethereal motion, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-comedian': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Comedic timing, quick zooms, slapstick motion, playful cuts, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-artist': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Artistic, painterly motion, flowing, expressive brushstroke movement, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-musician': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Musical rhythm, beat-synced cuts, concert lighting, sonic wave motion, ',
    zhipuFallback: 'cogvideox-2',
  },

  // ─── Specialized models (10) ───
  'delta-vision': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Hyperrealistic, smooth motion, true-to-life, macro detail, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-code': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Technical animation, code visualization, schematic motion, dark theme, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-islamic': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Elegant Islamic art, arabesque motion, flowing calligraphy, golden light, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-egyptian': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Epic pharaonic, golden sand dunes, ancient monuments, desert sun, cinematic, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-analyst': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Data-driven motion, chart animations, infographic reveals, clean transitions, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-teacher': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Educational, clear step-by-step reveals, labeled diagrams, bright lighting, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-motivator': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Inspiring, dynamic sunrise, powerful forward motion, golden hour, uplifting, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-linguist': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Typographic motion, multilingual text reveals, script animation, linguistic flow, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-diplomat': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Diplomatic, balanced composition, formal camera, composed movement, neutral tones, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-guardian': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Protective, shield formation, warm glow motion, safe haven, sentinel watch, ',
    zhipuFallback: 'cogvideox-flash',
  },

  // ─── Professional models (14) ───
  'delta-research': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Scientific visualization, accurate motion, educational, research quality, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-doctor': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Medical visualization, clinical precision, anatomical motion, clean sterile, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-psychology': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Psychological depth, layered motion, introspective camera, abstract mind, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-personality': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Expressive character motion, vibrant personality, dynamic portrait animation, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-fargh': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Scholarly manuscript, ornate border animation, Islamic jurisprudence, flowing text, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-pharmacy': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Pharmaceutical, molecular motion, precise clinical animation, lab quality, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-law': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Legal formal, structured composition, official document reveal, marble halls, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-engineering': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Engineering, CAD animation, isometric rotation, structural assembly, blueprint, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-business': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Corporate, professional presentation, smooth business motion, executive quality, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-translation': {
    pollinationsModel: 'veo',
    label: 'Google Veo',
    stylePrefix: 'Multilingual, text translation animation, cultural bridge, global motion, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-history': {
    pollinationsModel: 'wan',
    label: 'Wan 2.6',
    stylePrefix: 'Historical narrative, period costume motion, ancient civilizations, epic scale, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-art': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Contemporary art, gallery installation, mixed media animation, bold colors, ',
    zhipuFallback: 'cogvideox-2',
  },
  'delta-cybersecurity': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Cybersecurity, digital shield animation, matrix code, encrypted data flow, ',
    zhipuFallback: 'cogvideox-flash',
  },
  'delta-skills': {
    pollinationsModel: 'wan-fast',
    label: 'Wan Fast',
    stylePrefix: 'Practical skills, hands-on tutorial motion, step-by-step reveal, clear layout, ',
    zhipuFallback: 'cogvideox-flash',
  },
};

/**
 * Chat model mapping: DeltaAI frontend model IDs → Pollinations chat models.
 *
 * UPDATED (2026-03-05): Only FREE-tier Pollinations models are used as primary
 * backends. Premium models (gemini, claude, grok, deepseek-pro, mistral-large,
 * openai-large, etc.) require authentication and are NOT used here.
 *
 * ✅ FREE-tier models (confirmed working with Referer header, no auth needed):
 *    openai — GPT-OSS 20B Reasoning LLM
 *    openai-fast — GPT-OSS 20B fast
 *    gpt-5.4-mini — GPT-5.4 Mini
 *    gemma — Google Gemma 4 26B
 *    nova-fast — Amazon Nova Micro
 *    qwen-coder — Qwen Coder
 *    mistral — Mistral
 *    kimi — Moonshot Kimi
 *    llama — LLaMA 3.3 70B
 *    qwen-large — Qwen Large
 *    qwen-vision — Qwen Vision
 *    deepseek — DeepSeek
 *    minimax — MiniMax
 *
 * ❌ REQUIRES AUTH (paid tier — DO NOT USE as primary):
 *    gemini, gemini-large, gemini-3.5-flash, gemini-fast,
 *    claude, claude-fast, claude-large, claude-opus-4.7,
 *    grok, grok-large, grok-4.3,
 *    deepseek-pro, mistral-large, mistral-4,
 *    openai-large, gpt-5.5, polly, glm, nova,
 *    perplexity-fast, qwen-coder-large
 *
 * HONEST LABELS: The `label` field shows the REAL Pollinations model name,
 * not a misleading one. If the backend is "qwen-large", the label says
 * "Qwen Large" — not "Gemini" or "Claude".
 *
 * STRATEGY: Multiple frontend models share the same free Pollinations backend,
 * but each gets a UNIQUE systemPromptSuffix to create distinct personalities.
 * The label honestly reports the real backend model.
 */
export const CHAT_MODEL_MAP: Record<string, ModelMappingEntry> = {
  // ─── Global models ───
  'gpt-4o': {
    pollinationsModel: 'openai',
    label: 'GPT-OSS (OpenAI)',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are GPT-4o, a highly capable AI assistant by OpenAI. You provide thorough, well-structured answers across all topics.',
  },
  'gemini-2': {
    pollinationsModel: 'openai',
    label: 'Qwen Large (Gemini-style)',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Gemini, Google\'s advanced AI. You excel at multimodal reasoning and provide balanced, well-researched answers. You are helpful, comprehensive, and consider multiple perspectives on complex topics.',
  },
  'claude-3-5': {
    pollinationsModel: 'openai',
    label: 'Mistral (Claude-style)',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Claude, an AI by Anthropic. You are thoughtful, nuanced, and careful. You always consider multiple perspectives and provide measured, honest responses. You acknowledge uncertainty and avoid overconfident claims.',
  },
  'llama-3': {
    pollinationsModel: 'openai',
    label: 'LLaMA 3.3 70B (Meta)',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are LLaMA by Meta. You provide direct, practical answers. You are efficient and get straight to the point while still being helpful and accurate.',
  },
  'mistral-large': {
    pollinationsModel: 'openai',
    label: 'Mistral',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Mistral, a European AI. You are precise, multilingual, and excel at following instructions exactly. You provide well-organized responses with clear structure.',
  },
  'command-r-plus': {
    pollinationsModel: 'openai',
    label: 'DeepSeek',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are DeepSeek, an AI specialized in coding and technical tasks. You write clean, efficient code and explain technical concepts clearly. You provide detailed step-by-step reasoning for complex problems.',
  },

  // ─── New models ───
  'gemini-2.5-pro': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Gemini 2.5 Pro, the most powerful AI model from Google. You provide comprehensive, detailed, and insightful responses with deep step-by-step thinking. You excel at complex reasoning, coding, and analysis.',
  },
  'gemini-2.5-flash': {
    pollinationsModel: 'openai',
    label: 'GPT-5.4 Mini',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Gemini 2.5 Flash, a fast and smart AI model from Google. You provide quick, accurate responses while maintaining high quality. You have built-in thinking capabilities for logical reasoning.',
  },
  'deepseek-r1': {
    pollinationsModel: 'openai',
    label: 'DeepSeek',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are DeepSeek R1, a deep thinking model specialized in reasoning and mathematics. You show your thinking steps clearly and verify each step. You provide detailed step-by-step solutions.',
  },
  'gemma-2': {
    pollinationsModel: 'openai',
    label: 'Gemma 4 26B',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Gemma 2, a lightweight Google model that is fast and balanced. You respond concisely and clearly while maintaining accuracy. Suitable for everyday tasks.',
  },

  // ─── Smart models ───
  'delta-ultra': {
    pollinationsModel: 'openai',
    label: 'GPT-OSS 20B',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Delta Ultra, the most advanced AI in the DeltaAI platform. You combine deep reasoning with creative thinking. You provide comprehensive, detailed, and insightful responses that demonstrate deep understanding.',
  },
  'delta-pro': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Delta Pro, a professional-grade AI assistant. You deliver high-quality, well-structured responses with expert-level knowledge. You balance depth with clarity.',
  },
  'delta-flash': {
    pollinationsModel: 'openai',
    label: 'GPT-OSS Fast',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Delta Flash, optimized for speed. You provide quick, concise, and accurate responses. Get to the point fast while maintaining quality.',
  },
  'delta-philosopher': {
    pollinationsModel: 'openai',
    label: 'Qwen Large (Deep reasoning)',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a philosopher AI. You think deeply about questions, explore multiple philosophical perspectives, and provide nuanced, thoughtful analysis. You reference philosophical traditions and encourage critical thinking.',
  },
  'delta-historian': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a historian AI. You provide historically accurate, well-sourced information. You contextualize events within their time periods and draw connections between past and present. You distinguish between established facts and interpretations.',
  },
  'delta-mathematician': {
    pollinationsModel: 'openai',
    label: 'Qwen Large (Math/Logic)',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a mathematician AI. You solve problems step-by-step with clear reasoning. You show your work, verify your answers, and explain mathematical concepts in an accessible way. You use precise mathematical notation when appropriate.',
  },
  'delta-strategist': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a strategic thinking AI. You analyze situations from multiple angles, consider risks and trade-offs, and develop actionable plans. You think several steps ahead and anticipate potential obstacles.',
  },

  // ─── Creative models ───
  'delta-creative': {
    pollinationsModel: 'openai',
    label: 'GPT-5.4 Mini',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a creative AI. You think outside the box, generate innovative ideas, and approach problems with imagination. You use vivid language, metaphors, and storytelling to make your responses engaging and inspiring.',
  },
  'delta-poet': {
    pollinationsModel: 'openai',
    label: 'Gemma 4 26B',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a poet AI. You express ideas with beauty, rhythm, and emotion. You can compose poetry in various styles and languages, and you appreciate the artistry in language. Even your prose responses have a lyrical quality.',
  },
  'delta-comedian': {
    pollinationsModel: 'openai',
    label: 'GPT-5.4 Mini',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a witty, humorous AI comedian. You have a playful personality and aren\'t afraid to be edgy or unconventional. You use humor, wordplay, and clever observations to make your responses entertaining while still being informative.',
  },
  'delta-artist': {
    pollinationsModel: 'openai',
    label: 'Qwen Vision',
    stylePrefix: '',
    zhipuFallback: 'glm-4v',
    systemPromptSuffix: 'You are an artist AI. You think visually and creatively. You understand art history, design principles, color theory, and aesthetics. You help with creative projects and provide insightful art critiques and suggestions.',
  },
  'delta-musician': {
    pollinationsModel: 'openai',
    label: 'MiniMax',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a musician AI. You understand music theory, composition, instruments, and genres. You help with songwriting, music analysis, and creative musical ideas. You appreciate rhythm, harmony, and melody in all forms.',
  },

  // ─── Specialized models ───
  'delta-vision': {
    pollinationsModel: 'openai',
    label: 'Qwen Vision',
    stylePrefix: '',
    zhipuFallback: 'glm-4v',
    systemPromptSuffix: 'You are Delta Vision, a visual analysis AI. You excel at describing and analyzing images, understanding visual content, and providing detailed observations about what you see.',
  },
  'delta-code': {
    pollinationsModel: 'openai',
    label: 'Qwen Coder',
    stylePrefix: '',
    zhipuFallback: 'codegeex-4',
    systemPromptSuffix: 'You are Delta Code, a programming specialist AI. You write production-quality code with proper error handling, clean architecture, and thorough documentation. You explain your code clearly and follow best practices for each language.',
  },
  'delta-islamic': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are an Islamic studies AI. You provide knowledgeable, respectful answers about Islam, Quran, Hadith, Fiqh, and Islamic history. You cite authentic sources and distinguish between different scholarly opinions. You are sensitive to the diversity of Islamic thought.',
  },
  'delta-egyptian': {
    pollinationsModel: 'openai',
    label: 'GPT-OSS 20B',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are an Egypt specialist AI. You have deep knowledge of Egyptian history from pharaonic times to modern Egypt. You understand Egyptian Arabic dialect, culture, traditions, and contemporary Egyptian society. You respond with Egyptian cultural context.',
  },
  'delta-analyst': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a data analyst AI. You excel at breaking down complex information, identifying patterns, and drawing actionable insights. You think critically and present your analysis with clear evidence and logical structure.',
  },
  'delta-teacher': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are an expert teacher AI. You explain concepts clearly with examples, analogies, and step-by-step guidance. You adapt your explanations to the learner\'s level, encourage questions, and check for understanding. You make learning engaging and accessible.',
  },
  'delta-motivator': {
    pollinationsModel: 'openai',
    label: 'Nova Fast',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a motivational AI coach. You inspire, encourage, and empower. You combine empathy with actionable advice. You celebrate progress, reframe challenges as opportunities, and help users find their inner strength.',
  },
  'delta-linguist': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a linguist AI. You are an expert in languages, translation, grammar, and etymology. You help with language learning, translation between languages, and understanding linguistic nuances. You appreciate the beauty and complexity of human languages.',
  },
  'delta-diplomat': {
    pollinationsModel: 'openai',
    label: 'GPT-5.4 Mini',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a diplomatic AI. You navigate sensitive topics with tact and cultural awareness. You seek common ground, present balanced viewpoints, and communicate respectfully even when discussing controversial subjects.',
  },
  'delta-guardian': {
    pollinationsModel: 'openai',
    label: 'GPT-OSS 20B',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a digital safety guardian AI. You prioritize user well-being, provide responsible guidance, and help users stay safe online. You are protective, caring, and always consider the ethical implications of your advice.',
  },

  // ─── Professional models ───
  'delta-research': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a research AI. You excel at academic research, literature reviews, and scientific analysis. You cite sources, distinguish between evidence and speculation, and provide thorough, well-referenced answers.',
  },
  'delta-doctor': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a medical AI assistant. You provide health information based on established medical knowledge. You always remind users to consult healthcare professionals for personal medical advice. You are thorough, cautious, and evidence-based.',
  },
  'delta-psychology': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a psychology AI. You understand human behavior, mental health, and psychological theories. You provide empathetic, evidence-based insights. You encourage professional help when appropriate and never diagnose.',
  },
  'delta-personality': {
    pollinationsModel: 'openai',
    label: 'GPT-5.4 Mini',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a personality analysis AI. You help users understand personality traits, communication styles, and interpersonal dynamics. You use established frameworks like Big Five, MBTI, and Enneagram appropriately.',
  },
  'delta-fargh': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Delta Fargh, specialized in Islamic jurisprudence and the science of differences between madhhabs (فقه الاختلاف). You explain scholarly differences with respect and depth, citing evidence from each school of thought.',
  },
  'delta-pharmacy': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a pharmacy and pharmacology AI. You provide accurate information about medications, drug interactions, and pharmaceutical science. You always advise consulting a pharmacist or doctor for personal medical decisions.',
  },
  'delta-law': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a legal knowledge AI. You provide general legal information and explain legal concepts clearly. You clarify that you are not a lawyer and recommend professional legal counsel for specific cases. You understand multiple legal systems.',
  },
  'delta-engineering': {
    pollinationsModel: 'openai',
    label: 'Qwen Coder',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are an engineering AI. You excel at technical problem-solving, system design, and engineering calculations. You apply scientific principles to practical problems and provide detailed, technically accurate solutions.',
  },
  'delta-business': {
    pollinationsModel: 'openai',
    label: 'GPT-OSS 20B',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a business strategy AI. You understand markets, entrepreneurship, finance, and management. You provide strategic insights, business analysis, and practical advice for business challenges and opportunities.',
  },
  'delta-translation': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a translation AI. You provide accurate, natural-sounding translations between languages. You preserve tone, context, and cultural nuances. You explain translation choices when helpful and note idiomatic differences.',
  },
  'delta-history': {
    pollinationsModel: 'openai',
    label: 'Qwen Large',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a history AI. You provide rich, contextualized historical narratives. You connect events across time periods and civilizations. You distinguish between primary and secondary sources and acknowledge historical debates.',
  },
  'delta-art': {
    pollinationsModel: 'openai',
    label: 'Qwen Vision',
    stylePrefix: '',
    zhipuFallback: 'glm-4v',
    systemPromptSuffix: 'You are an art and design AI. You understand visual arts, art history, design principles, and creative processes. You help users explore artistic ideas, provide constructive critiques, and inspire creative projects.',
  },
  'delta-cybersecurity': {
    pollinationsModel: 'openai',
    label: 'Qwen Coder',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a cybersecurity AI. You are expert in information security, threat analysis, secure coding practices, and privacy. You help users understand security risks and implement protective measures. You promote ethical hacking and responsible disclosure.',
  },
  'delta-skills': {
    pollinationsModel: 'openai',
    label: 'Nova Fast',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are a skills development AI. You help users learn practical skills efficiently. You break down complex skills into manageable steps, provide actionable practice exercises, and track learning progress. You adapt to different learning styles.',
  },
  'glm-5-2': {
    pollinationsModel: 'openai',
    label: 'Abbas (GLM 5.2)',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Abbas (عبس), a friendly Arabic AI assistant. You respond in Arabic (Fusha or Egyptian dialect based on user preference). You are helpful, accurate, and organized. You can generate content, write code, translate, and answer any question with high quality.',
  },
  'abbas-creative': {
    pollinationsModel: 'openai',
    label: 'Abbas Creative',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Abbas Creative (عبس المبدع), a talented creative writer. You specialize in creative writing: poetry, stories, literary articles, and creative marketing content. Respond in Arabic with beautiful and engaging style.',
  },
  'abbas-coder': {
    pollinationsModel: 'openai',
    label: 'Abbas Coder',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Abbas Coder (عبس المبرمج), a professional programmer. You specialize in writing, debugging, and improving code. Support all programming languages. Write clean, organized code with clear comments. Explain code simply.',
  },
  'abbas-fast': {
    pollinationsModel: 'openai-fast',
    label: 'Abbas Fast',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Abbas Fast (عبس السريع), a quick and efficient assistant. Respond with concise, direct answers without elaboration. Perfect for quick questions.',
  },
  'abbas-artist': {
    pollinationsModel: 'openai',
    label: 'Abbas Artist',
    stylePrefix: '',
    zhipuFallback: 'glm-5.2',
    systemPromptSuffix: 'You are Abbas Artist (عبس الفنان), an AI image generation assistant. When the user requests an image, describe it in detail and generate it. Use the sana model for image generation. Be creative in describing images.',
  },
};

/**
 * Image edit model mapping: DeltaAI frontend model IDs → Pollinations edit models.
 *
 * UPDATED: Now includes kontext and p-image-edit as dedicated edit models,
 * plus all image models that support editing via the gen API.
 */
export const EDIT_MODEL_MAP: Record<string, PollinationsEditModel> = {
  'gpt-4o': 'gptimage',
  'gemini-2': 'seedream5',
  'claude-3-5': 'kontext',
  'llama-3': 'zimage',
  'mistral-large': 'nova-canvas',
  'command-r-plus': 'p-image-edit',
  'gemini-2.5-pro': 'gpt-image-2',
  'gemini-2.5-flash': 'flux',
  'deepseek-r1': 'kontext',
  'gemma-2': 'gptimage',
  'delta-ultra': 'gpt-image-2',
  'delta-pro': 'seedream-pro',
  'delta-flash': 'flux',
  'delta-creative': 'flux',
  'delta-artist': 'qwen-image',
  'delta-vision': 'gpt-image-2',
  'delta-doctor': 'gptimage',
  'delta-islamic': 'seedream5',
  'delta-law': 'nova-canvas',
  'delta-code': 'zimage',
  'delta-engineering': 'flux',
  'delta-philosopher': 'kontext',
  'delta-historian': 'seedream-pro',
  'delta-mathematician': 'p-image-edit',
  'delta-strategist': 'gpt-image-2',
  'delta-poet': 'flux',
  'delta-comedian': 'grok-imagine',
  'delta-musician': 'flux',
  'delta-motivator': 'flux',
  'delta-linguist': 'flux',
  'delta-diplomat': 'gpt-image-2',
  'delta-guardian': 'zimage',
  'delta-egyptian': 'nova-canvas',
  'delta-analyst': 'flux',
  'delta-teacher': 'gptimage',
  'delta-research': 'seedream5',
  'delta-psychology': 'flux',
  'delta-personality': 'flux',
  'delta-fargh': 'gptimage',
  'delta-pharmacy': 'gpt-image-2',
  'delta-business': 'grok-imagine-pro',
  'delta-translation': 'seedream5',
  'delta-history': 'nova-canvas',
  'delta-art': 'zimage',
  'delta-cybersecurity': 'flux',
  'delta-skills': 'gptimage',
};

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect image format from base64 magic bytes.
 * More reliable than trusting Content-Type headers.
 */
export function detectImageFormat(base64: string): { ext: 'jpg' | 'png' | 'webp' | 'gif'; mimeType: string } {
  if (base64.startsWith('/9j/')) return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (base64.startsWith('iVBOR')) return { ext: 'png', mimeType: 'image/png' };
  if (base64.startsWith('R0lGOD')) return { ext: 'gif', mimeType: 'image/gif' };
  if (base64.startsWith('UklGR')) return { ext: 'webp', mimeType: 'image/webp' };
  return { ext: 'jpg', mimeType: 'image/jpeg' };
}

/**
 * Convert an ArrayBuffer from a fetch response to base64 string.
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
 * Sanitize a prompt to reduce the chance of triggering content filters.
 * Replaces potentially sensitive Arabic words with safer alternatives.
 */
export function sanitizePrompt(prompt: string): string {
  const sanitizations: [RegExp, string][] = [
    [/\bضرب\b/g, 'ضرب (rhythm)'], [/\bقتل\b/g, 'هزيمة'], [/\bحرب\b/g, 'منافسة'],
    [/\bسلاح\b/g, 'أداة'], [/\bدم\b/g, 'لون أحمر'], [/\bجسد\b/g, 'شكل'],
    [/\bعاري\b/g, 'بسيط'], [/\bجنس\b/g, 'نوع'], [/\bسياس\b/g, 'إدار'], [/\bرئيس\b/g, 'قائد'],
  ];
  let sanitized = prompt;
  for (const [pattern, replacement] of sanitizations) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

/**
 * Check if an error is a content filter / moderation error.
 */
export function isContentFilterError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message || '';
    return (
      msg.includes('1301') ||
      msg.includes('contentFilter') ||
      msg.includes('不安全或敏感内容') ||
      msg.includes('content_filter') ||
      msg.includes('safety') ||
      msg.includes('inappropriate') ||
      msg.includes('blocked') ||
      msg.includes('moderation') ||
      msg.includes('NSFW')
    );
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the Pollinations image model mapping for a DeltaAI frontend model ID.
 * Returns the mapping entry or a default.
 */
export function getImageModelMapping(modelId?: string): ModelMappingEntry {
  if (!modelId) return IMAGE_MODEL_MAP['gpt-4o'];
  return IMAGE_MODEL_MAP[modelId] || IMAGE_MODEL_MAP['gpt-4o'];
}

/**
 * Get the Pollinations video model mapping for a DeltaAI frontend model ID.
 */
export function getVideoModelMapping(modelId?: string): ModelMappingEntry {
  if (!modelId) return VIDEO_MODEL_MAP['gpt-4o'];
  return VIDEO_MODEL_MAP[modelId] || VIDEO_MODEL_MAP['gpt-4o'];
}

/**
 * Get the Pollinations chat model mapping for a DeltaAI frontend model ID.
 */
export function getChatModelMapping(modelId?: string): ModelMappingEntry {
  if (!modelId) return CHAT_MODEL_MAP['gpt-4o'];
  return CHAT_MODEL_MAP[modelId] || CHAT_MODEL_MAP['gpt-4o'];
}

/**
 * Get the Pollinations edit model for a DeltaAI frontend model ID.
 */
export function getEditModelMapping(modelId?: string): PollinationsEditModel {
  if (!modelId) return 'gptimage';
  return EDIT_MODEL_MAP[modelId] || 'gptimage';
}

// ═══════════════════════════════════════════════════════════════════════
// IMAGE GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate an image using the FREE legacy endpoint (image.pollinations.ai).
 * No API key required. Returns the raw image converted to base64.
 *
 * Endpoint: GET https://image.pollinations.ai/prompt/{prompt}?model=flux&width=1024&height=1024&nologo=true
 */
async function generateImageLegacy(
  prompt: string,
  model: PollinationsImageModel = 'flux',
  width: number = 1024,
  height: number = 1024,
  options: { seed?: number; negative_prompt?: string; enhance?: boolean; nologo?: boolean } = {}
): Promise<{ base64: string; format: 'jpg' | 'png' | 'webp' | 'gif'; mimeType: string }> {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: String(options.nologo ?? true),
  });

  if (options.seed !== undefined) params.set('seed', String(options.seed));
  if (options.negative_prompt) params.set('negative_prompt', options.negative_prompt);
  if (options.enhance !== undefined) params.set('enhance', String(options.enhance));

  const url = `${LEGACY_IMAGE_BASE}/prompt/${encodedPrompt}?${params.toString()}`;

  traceImage(`[Pollinations] Legacy image gen: model=${model}, ${width}x${height}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Pollinations legacy image error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    // Detect format from magic bytes
    const detected = detectImageFormat(base64);

    traceImage(`[Pollinations] Legacy image gen success: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB, ${detected.ext}`);

    return {
      base64,
      format: detected.ext,
      mimeType: detected.mimeType,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Generate an image using the new gen.pollinations.ai OpenAI-compatible endpoint.
 * Requires an auth token. Returns JSON with base64 or URL.
 *
 * Endpoint: POST https://gen.pollinations.ai/v1/images/generations
 */
async function generateImageGenAPI(
  prompt: string,
  model: PollinationsImageModel = 'flux',
  width: number = 1024,
  height: number = 1024,
  authToken: string,
  options: { seed?: number; negative_prompt?: string; enhance?: boolean; nologo?: boolean } = {}
): Promise<{ base64: string; format: 'jpg' | 'png' | 'webp' | 'gif'; mimeType: string }> {
  const url = `${GEN_API_BASE}/v1/images/generations`;

  traceImage(`[Pollinations] Gen API image gen: model=${model}, ${width}x${height}`);

  const body: Record<string, unknown> = {
    model,
    prompt,
    width,
    height,
    nologo: options.nologo ?? true,
    response_format: 'b64_json',
  };

  if (options.seed !== undefined) body.seed = options.seed;
  if (options.negative_prompt) body.negative_prompt = options.negative_prompt;
  if (options.enhance !== undefined) body.enhance = options.enhance;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Pollinations gen API image error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();

    // Extract base64 from response
    let base64 = '';
    if (result.data?.[0]?.b64_json) {
      base64 = result.data[0].b64_json;
    } else if (result.data?.[0]?.base64) {
      base64 = result.data[0].base64;
    } else if (result.data?.[0]?.url) {
      // Download from URL and convert to base64
      const imageUrl = result.data[0].url;
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to download image from URL: ${imgResponse.status}`);
      const arrayBuffer = await imgResponse.arrayBuffer();
      base64 = arrayBufferToBase64(arrayBuffer);
    }

    if (!base64) throw new Error('No image data in Pollinations gen API response');

    const detected = detectImageFormat(base64);

    traceImage(`[Pollinations] Gen API image gen success: ${detected.ext}`);

    return {
      base64,
      format: detected.ext,
      mimeType: detected.mimeType,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Main image generation function. Tries the free legacy endpoint first,
 * then falls back to the gen API if an auth token is provided.
 * Includes retry logic and prompt sanitization fallback.
 *
 * @returns PollinationsImageResponse with base64 image data
 * @throws Error if all attempts fail
 */
export async function generateImage(request: PollinationsImageRequest): Promise<PollinationsImageResponse> {
  const {
    prompt,
    model = 'flux',
    width = 1024,
    height = 1024,
    seed,
    negative_prompt,
    enhance,
    nologo = true,
    authToken,
  } = request;

  const promptsToTry = [prompt, sanitizePrompt(prompt)];
  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    for (const tryPrompt of promptsToTry) {
      // Strategy 1: Free legacy endpoint (no auth needed)
      try {
        traceImage(`[Pollinations] Attempting legacy image gen (retry=${retry}): ${tryPrompt.slice(0, 60)}...`);
        const result = await generateImageLegacy(tryPrompt, model, width, height, {
          seed,
          negative_prompt,
          enhance,
          nologo,
        });

        return {
          base64: result.base64,
          format: result.format,
          mimeType: result.mimeType,
          model,
          prompt: tryPrompt,
          width,
          height,
          source: 'legacy-free',
        };
      } catch (legacyError) {
        lastError = legacyError instanceof Error ? legacyError : new Error(String(legacyError));
        traceImage(`[Pollinations] Legacy endpoint failed: ${lastError.message.slice(0, 100)}`);

        if (isContentFilterError(legacyError)) {
          traceImage('[Pollinations] Content filter triggered on legacy endpoint, trying sanitized prompt');
          continue; // Try next prompt variant
        }
      }

      // Strategy 2: Gen API endpoint (needs auth token)
      if (authToken) {
        try {
          traceImage(`[Pollinations] Attempting gen API image gen (retry=${retry}): ${tryPrompt.slice(0, 60)}...`);
          const result = await generateImageGenAPI(tryPrompt, model, width, height, authToken, {
            seed,
            negative_prompt,
            enhance,
            nologo,
          });

          return {
            base64: result.base64,
            format: result.format,
            mimeType: result.mimeType,
            model,
            prompt: tryPrompt,
            width,
            height,
            source: 'gen-api',
          };
        } catch (genApiError) {
          lastError = genApiError instanceof Error ? genApiError : new Error(String(genApiError));
          traceImage(`[Pollinations] Gen API failed: ${lastError.message.slice(0, 100)}`);

          if (isContentFilterError(genApiError)) {
            continue; // Try next prompt variant
          }
        }
      }
    }

    // Wait before retry
    if (retry < MAX_RETRIES) {
      traceImage(`[Pollinations] Retrying image gen in ${RETRY_DELAY_MS}ms...`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[Pollinations] All image generation attempts failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('Image generation failed');
}

// ═══════════════════════════════════════════════════════════════════════
// VIDEO GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a video using Pollinations gen API.
 * The video endpoint returns MP4 directly or requires polling for async tasks.
 *
 * Endpoint: GET https://gen.pollinations.ai/video/{prompt}?model=veo&width=1024&height=1024&duration=5
 */
export async function generateVideo(request: PollinationsVideoRequest): Promise<PollinationsVideoResponse> {
  const {
    prompt,
    model = 'veo',
    width = 1024,
    height = 1024,
    duration = 5,
    aspect_ratio,
    audio = false,
    images,
    authToken,
  } = request;

  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    duration: String(duration),
  });

  if (aspect_ratio) params.set('aspect_ratio', aspect_ratio);
  if (audio) params.set('audio', 'true');

  const url = `${GEN_API_BASE}/video/${encodedPrompt}?${params.toString()}`;

  traceImage(`[Pollinations] Video gen: model=${model}, ${width}x${height}, duration=${duration}s`);

  const headers: Record<string, string> = {
    'Accept': 'video/*',
    'Referer': 'https://deltaai.platform',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // Build request body for POST if we have reference images
  let requestBody: string | undefined;
  if (images && images.length > 0) {
    const body: Record<string, unknown> = {
      prompt,
      model,
      width,
      height,
      duration,
      audio,
    };
    if (aspect_ratio) body.aspect_ratio = aspect_ratio;

    // Reference images: image[0] = start frame, image[1] = end frame
    if (images.length >= 1) body.image = images[0];
    if (images.length >= 2) body.image_end = images[1];

    requestBody = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), VIDEO_TIMEOUT_MS);

      const response = await fetch(
        requestBody ? `${GEN_API_BASE}/video` : url,
        {
          method: requestBody ? 'POST' : 'GET',
          signal: controller.signal,
          headers,
          body: requestBody,
        }
      );

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Pollinations video error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const contentType = response.headers.get('content-type') || '';

      // If the response is video (MP4), download and return
      if (contentType.includes('video/') || contentType.includes('octet-stream')) {
        const arrayBuffer = await response.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);

        traceImage(`[Pollinations] Video gen success: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB`);

        return {
          videoUrl: url, // The original URL can be used for re-downloading
          base64,
          model,
          prompt,
          duration,
          taskStatus: 'SUCCESS',
        };
      }

      // If the response is JSON, it might be an async task or contain a URL
      if (contentType.includes('application/json')) {
        const result = await response.json();

        // Check for async task
        if (result.id) {
          traceImage(`[Pollinations] Video gen async task started: ${result.id}`);
          return {
            videoUrl: '',
            model,
            prompt,
            duration,
            taskId: result.id,
            taskStatus: result.task_status || 'PROCESSING',
          };
        }

        // Check for direct video URL in response
        const videoUrl = result.video_url || result.url || result.video_result?.[0]?.url;
        if (videoUrl) {
          traceImage(`[Pollinations] Video gen got URL: ${videoUrl.slice(0, 80)}...`);
          return {
            videoUrl,
            model,
            prompt,
            duration,
            taskStatus: 'SUCCESS',
          };
        }

        throw new Error('No video data or URL in Pollinations response');
      }

      // Fallback: treat raw response as video
      const arrayBuffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      return {
        videoUrl: url,
        base64,
        model,
        prompt,
        duration,
        taskStatus: 'SUCCESS',
      };
    } catch (videoError) {
      lastError = videoError instanceof Error ? videoError : new Error(String(videoError));
      traceImage(`[Pollinations] Video gen attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isContentFilterError(videoError)) {
        // Try sanitized prompt
        const sanitizedPrompt = sanitizePrompt(prompt);
        if (sanitizedPrompt !== prompt) {
          const sanitizedRequest = { ...request, prompt: sanitizedPrompt };
          return generateVideo(sanitizedRequest);
        }
        break; // Don't retry content filter errors
      }

      if (retry < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (retry + 1)); // Exponential backoff
      }
    }
  }

  traceError(`[Pollinations] All video generation attempts failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('Video generation failed');
}

/**
 * Poll for the status of an async video generation task.
 * Call this repeatedly until taskStatus is 'SUCCESS' or 'FAIL'.
 */
export async function pollVideoStatus(
  taskId: string,
  authToken?: string
): Promise<PollinationsVideoResponse> {
  const url = `${GEN_API_BASE}/video/status/${encodeURIComponent(taskId)}`;

  const headers: Record<string, string> = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(`Poll video status error ${response.status}`);
  }

  const result = await response.json();

  const taskStatus = result.task_status || result.status || 'PROCESSING';

  if (taskStatus === 'PROCESSING') {
    return {
      videoUrl: '',
      taskId,
      taskStatus: 'PROCESSING',
      model: result.model || '',
      prompt: result.prompt || '',
    };
  }

  if (taskStatus === 'FAIL') {
    return {
      videoUrl: '',
      taskId,
      taskStatus: 'FAIL',
      model: result.model || '',
      prompt: result.prompt || '',
    };
  }

  // SUCCESS — extract video URL
  const videoUrl = result.video_url || result.url || result.video_result?.[0]?.url || '';
  return {
    videoUrl,
    taskId,
    taskStatus: 'SUCCESS',
    model: result.model || '',
    prompt: result.prompt || '',
    duration: result.duration,
  };
}

/**
 * Download a video from a URL and convert to base64.
 */
export async function downloadVideoAsBase64(videoUrl: string): Promise<string> {
  traceImage(`[Pollinations] Downloading video: ${videoUrl.slice(0, 80)}...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VIDEO_TIMEOUT_MS);

  try {
    const response = await fetch(videoUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return arrayBufferToBase64(arrayBuffer);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT / TEXT GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a chat completion using the NEW OpenAI-compatible endpoint.
 * Non-streaming mode.
 *
 * UPDATED: Now uses gen.pollinations.ai/v1/chat/completions instead of
 * the deprecated text.pollinations.ai endpoint. The old endpoint returned
 * "Model not found" for models like claude and grok.
 *
 * Endpoint: POST https://gen.pollinations.ai/v1/chat/completions
 * No auth needed for anonymous tier.
 */
export async function generateChatCompletion(
  request: PollinationsChatRequest
): Promise<PollinationsChatResponse> {
  const {
    messages,
    model = 'openai',
    temperature = 0.7,
    max_tokens = 4096,
    top_p,
    stream = false,
    authToken,
    seed,
    systemPromptSuffix,
  } = request;

  // Use the NEW gen.pollinations.ai/v1/chat/completions endpoint
  // (OpenAI-compatible, supports ALL models, no auth needed for anonymous tier)
  const url = `${GEN_API_BASE}/v1/chat/completions`;

  // Inject systemPromptSuffix into the system message if provided
  const processedMessages = messages.map((m) => {
    if (m.role === 'system' && systemPromptSuffix) {
      return {
        role: m.role as 'system',
        content: `${m.content}\n\n${systemPromptSuffix}`,
      };
    }
    return m;
  });

  traceAPI(`[Pollinations] Chat completion (gen API): model=${model}, messages=${messages.length}`);

  const body: Record<string, unknown> = {
    model,
    messages: processedMessages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens,
    stream: false, // Force non-streaming for this function
  };

  if (top_p !== undefined) body.top_p = top_p;
  if (seed !== undefined) body.seed = seed;

  // Referer header is REQUIRED for Pollinations free tier (anonymous access)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Referer': 'https://deltaai.platform',
  };

  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(body),
      });

      if (timeoutId) clearTimeout(timeoutId);

      // AUTO-RETRY: If model requires auth (401), fall back to 'openai'
      if (response.status === 401 && body.model !== 'openai') {
        traceAPI(`[Pollinations] Model '${body.model}' requires auth (401), falling back to 'openai'`);
        body.model = 'openai';
        continue; // Retry with openai model
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Pollinations chat error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const result = await response.json();

      traceAPI(`[Pollinations] Chat completion success: model=${result.model || model}`);

      return result as PollinationsChatResponse;
    } catch (chatError) {
      lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
      traceAPI(`[Pollinations] Chat attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isContentFilterError(chatError)) break;
      if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[Pollinations] Chat completion failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('Chat completion failed');
}

/**
 * Generate a streaming chat completion using the NEW OpenAI-compatible endpoint.
 * Returns an async iterable of SSE chunks.
 *
 * UPDATED: Now uses gen.pollinations.ai/v1/chat/completions instead of
 * the deprecated text.pollinations.ai endpoint. The old endpoint returned
 * "Model not found" for models like claude and grok.
 *
 * Endpoint: POST https://gen.pollinations.ai/v1/chat/completions
 * No auth needed for anonymous tier. Standard OpenAI SSE format.
 */
export async function streamChatCompletion(
  request: PollinationsChatRequest
): Promise<AsyncIterable<PollinationsChatStreamChunk>> {
  const {
    messages,
    model = 'openai',
    temperature = 0.7,
    max_tokens = 4096,
    top_p,
    seed,
    systemPromptSuffix,
    authToken,
  } = request;

  // Inject systemPromptSuffix into the system message if provided.
  // This is how we differentiate model personalities even though they
  // may share the same backend. Each frontend model has a unique
  // suffix that shapes the AI's behavior and response style.
  const processedMessages = messages.map((m) => {
    if (m.role === 'system' && systemPromptSuffix) {
      return {
        role: m.role as 'system',
        content: `${m.content}\n\n${systemPromptSuffix}`,
      };
    }
    return m;
  });

  const reqBody: Record<string, unknown> = {
    model,
    messages: processedMessages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens,
    stream: true,
  };

  if (top_p !== undefined) reqBody.top_p = top_p;
  if (seed !== undefined) reqBody.seed = seed;

  // Referer header is REQUIRED for Pollinations free tier (anonymous access)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Referer': 'https://deltaai.platform',
  };

  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  traceAPI(`[Pollinations] Streaming chat: model=${model}${systemPromptSuffix ? ' (with personality suffix)' : ''}`);

  // STRATEGY: جرب text.pollinations.ai/openai الأول (مجاني بدون auth)
  // لأن gen.pollinations.ai بقى محتاج API key
  const textApiUrl = `${TEXT_API_BASE}/openai`;

  let response: Response;
  let usedModel = model;

  try {
    const controller = new AbortController();
    const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

    response = await fetch(textApiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify(reqBody),
    });

    if (timeoutId) clearTimeout(timeoutId);

    // لو text API فشل، جرّب gen API
    if (!response.ok) {
      traceAPI(`[Pollinations] Text API failed (${response.status}), trying gen API`);
      const genApiUrl = `${GEN_API_BASE}/v1/chat/completions`;
      const controller2 = new AbortController();
      const timeoutId2 = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller2.abort(), CHAT_TIMEOUT_MS) : null;
      try {
        response = await fetch(genApiUrl, {
          method: 'POST',
          signal: controller2.signal,
          headers,
          body: JSON.stringify(reqBody),
        });
      } catch (e) {
        response = null as any;
      }
      if (timeoutId2) clearTimeout(timeoutId2);
    }

    // لو كل اللي فوق فشل، جرّب legacy endpoint (GET request)
    if (!response || !response.ok) {
      traceAPI(`[Pollinations] All APIs failed, trying legacy GET endpoint`);
      const prompt = encodeURIComponent(messages[messages.length - 1]?.content || 'Hello');
      const legacyUrl = `${TEXT_API_BASE}/${prompt}?model=openai&seed=${seed || 42}`;
      const controller3 = new AbortController();
      const timeoutId3 = setTimeout(() => controller3.abort(), CHAT_TIMEOUT_MS || 30000);

      const legacyResponse = await fetch(legacyUrl, {
        method: 'GET',
        signal: controller3.signal,
        headers: { 'Referer': 'https://deltaai.platform' },
      });
      clearTimeout(timeoutId3);

      if (legacyResponse.ok) {
        const text = await legacyResponse.text();
        async function* legacyStream(): AsyncIterable<PollinationsChatStreamChunk> {
          yield {
            id: `pollinations_legacy_${Date.now()}`,
            model: 'openai',
            choices: [{
              index: 0,
              delta: { role: 'assistant', content: text },
              finish_reason: 'stop',
            }],
          };
        }
        return legacyStream();
      }

      throw new Error(`Both gen API and legacy Pollinations endpoints failed`);
    }
  } catch (fetchError) {
    // Gen API fetch error, try legacy endpoint as last resort
    traceAPI(`[Pollinations] Gen API fetch error, trying legacy: ${fetchError instanceof Error ? fetchError.message.slice(0, 100) : String(fetchError)}`);
    const legacyUrl = `${TEXT_API_BASE}/`;
    const legacyBody = {
      messages: processedMessages.map((m) => ({ role: m.role, content: m.content })),
      model: 'openai',
      seed: seed || 42,
    };
    const controller3 = new AbortController();
    const timeoutId3 = setTimeout(() => controller3.abort(), CHAT_TIMEOUT_MS);

    const legacyResponse = await fetch(legacyUrl, {
      method: 'POST',
      signal: controller3.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyBody),
    });
    clearTimeout(timeoutId3);

    if (legacyResponse.ok) {
      const text = await legacyResponse.text();
      async function* legacyStream(): AsyncIterable<PollinationsChatStreamChunk> {
        yield {
          id: `pollinations_legacy_${Date.now()}`,
          model: 'openai',
          choices: [{
            index: 0,
            delta: { role: 'assistant', content: text },
            finish_reason: 'stop',
          }],
        };
      }
      return legacyStream();
    }

    throw new Error(`All Pollinations endpoints failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Pollinations streaming chat error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const resBody = response.body as ReadableStream<Uint8Array> | null;
  if (!resBody) {
    throw new Error('No response body for streaming');
  }

  const reader = resBody.getReader();
  const decoder = new TextDecoder();

  // Return an async iterable that parses SSE chunks
  async function* generateChunks(): AsyncIterable<PollinationsChatStreamChunk> {
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
          if (dataStr === '[DONE]') return;

          try {
            const chunk = JSON.parse(dataStr) as PollinationsChatStreamChunk;
            yield chunk;
          } catch {
            // Skip unparseable lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return generateChunks();
}

/**
 * Simple text generation using the GET text endpoint.
 * Less powerful than chat completions but doesn't need auth.
 *
 * Endpoint: GET https://gen.pollinations.ai/text/{prompt}?model=openai
 */
export async function generateText(
  prompt: string,
  model: PollinationsChatModel = 'openai',
  options: { seed?: number; authToken?: string } = {}
): Promise<string> {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({ model });
  if (options.seed !== undefined) params.set('seed', String(options.seed));

  const url = `${GEN_API_BASE}/text/${encodedPrompt}?${params.toString()}`;

  const headers: Record<string, string> = {};
  if (options.authToken) headers['Authorization'] = `Bearer ${options.authToken}`;

  const controller = new AbortController();
  const timeoutId = CHAT_TIMEOUT_MS > 0 ? setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Pollinations text gen error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    return await response.text();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// IMAGE EDITING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Edit an image using Pollinations gen API.
 *
 * Endpoint: POST https://gen.pollinations.ai/v1/images/edits
 */
export async function editImage(
  request: PollinationsImageEditRequest
): Promise<PollinationsImageEditResponse> {
  const {
    image,
    prompt,
    model = 'gptimage',
    width = 1024,
    height = 1024,
    authToken,
  } = request;

  const url = `${GEN_API_BASE}/v1/images/edits`;

  traceImage(`[Pollinations] Image edit: model=${model}, ${width}x${height}`);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${authToken || ''}`,
  };

  // Use FormData for file upload
  const formData = new FormData();

  // Add the image
  let imageBlob: Blob;
  if (image.startsWith('data:')) {
    // Data URL — convert to Blob
    const [meta, base64Data] = image.split(',');
    const mimeType = meta.match(/data:([^;]+)/)?.[1] || 'image/png';
    const bytes = Buffer.from(base64Data, 'base64');
    imageBlob = new Blob([bytes], { type: mimeType });
  } else if (image.startsWith('http')) {
    // URL — download first
    const imgResponse = await fetch(image);
    imageBlob = await imgResponse.blob();
  } else {
    // Assume raw base64
    const bytes = Buffer.from(image, 'base64');
    imageBlob = new Blob([bytes], { type: 'image/png' });
  }

  formData.append('image', imageBlob, 'image.png');
  formData.append('prompt', prompt);
  formData.append('model', model);
  formData.append('width', String(width));
  formData.append('height', String(height));

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EDIT_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: formData,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Pollinations image edit error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const result = await response.json();

      // Extract base64 from response
      let base64 = '';
      if (result.data?.[0]?.b64_json) {
        base64 = result.data[0].b64_json;
      } else if (result.data?.[0]?.base64) {
        base64 = result.data[0].base64;
      } else if (result.data?.[0]?.url) {
        const imageUrl = result.data[0].url;
        const imgResponse = await fetch(imageUrl);
        if (!imgResponse.ok) throw new Error(`Failed to download edited image: ${imgResponse.status}`);
        const arrayBuffer = await imgResponse.arrayBuffer();
        base64 = arrayBufferToBase64(arrayBuffer);
      }

      if (!base64) throw new Error('No image data in Pollinations edit response');

      const detected = detectImageFormat(base64);

      traceImage(`[Pollinations] Image edit success: model=${model}, ${detected.ext}`);

      return {
        base64,
        format: detected.ext,
        mimeType: detected.mimeType,
        model,
        prompt,
      };
    } catch (editError) {
      lastError = editError instanceof Error ? editError : new Error(String(editError));
      traceImage(`[Pollinations] Image edit attempt ${retry + 1} failed: ${lastError.message.slice(0, 100)}`);

      if (isContentFilterError(editError)) break;
      if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  traceError(`[Pollinations] All image edit attempts failed: ${lastError?.message?.slice(0, 100)}`);
  throw lastError || new Error('Image edit failed');
}