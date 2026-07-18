/**
 * video-models.ts — DeltaAI Video Generation Model Definitions
 *
 * Defines all REAL video generation models available on the DeltaAI platform.
 *
 * PROVIDERS (tested 2026-06):
 *   ✅ huggingface  — Gradio Spaces (free with HF token, NO content filter)
 *
 * REMOVED providers:
 *   ❌ Pollinations — all video endpoints now require paid API key (401)
 *   ❌ ZhipuAI     — strict content filter rejects almost all prompts
 *   ❌ Z-AI (SDK)  — routes to ZhipuAI backend, same content filter issue
 *
 * Why removed:
 *   ZhipuAI (the Chinese company behind CogVideoX) has very strict
 *   content filters that reject most prompts as "inappropriate" — even
 *   innocent prompts like "a cat walking in a garden" get rejected.
 *   The z-ai-web-dev-sdk routes to the same ZhipuAI backend, so it has
 *   the same problem. Only HuggingFace Gradio Spaces work reliably.
 */

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export type VideoModelProvider = 'huggingface';

export interface VideoGenModel {
  /** Unique ID (e.g., 'hf-cogvideox-2b') */
  id: string;
  /** Arabic name */
  name: string;
  /** English name */
  nameEn: string;
  provider: VideoModelProvider;
  /** The real backend model ID for the provider */
  backendModel: string;
  /** Short description in Arabic */
  description: string;
  /** Short description in English */
  descriptionEn: string;
  /** Icon/emoji */
  icon: string;
  /** Badge color class */
  badgeColor: string;
  /** Whether this model is available */
  available: boolean;
  /** Style prefix for cinematic direction */
  stylePrefix: string;
  /** Maximum duration in seconds */
  maxDuration: number;
  /** Speed rating: 1 (slow) to 5 (instant) */
  speed: number;
  /** Quality rating: 1 (basic) to 5 (best) */
  quality: number;
  /** Whether this model supports image-to-video */
  supportsImageToVideo: boolean;
  /** Estimated generation time in seconds (for timeout/UI) */
  estimatedTime: number;
}

// ═══════════════════════════════════════════════════════════════════════
// HuggingFace Video Models (Gradio Spaces) — THE ONLY WORKING PROVIDER
// ═══════════════════════════════════════════════════════════════════════
//
// Each backendModel MUST match a key in HF_VIDEO_MODELS in hf-video.service.ts exactly.
// These models run on HuggingFace ZeroGPU Spaces — free, reliable, NO content filter.

const HF_VIDEO_MODEL_DEFS: VideoGenModel[] = [
  {
    id: 'hf-cogvideox-2b',
    name: 'كوغ فيديو إكس 2B',
    nameEn: 'CogVideoX-2B',
    provider: 'huggingface',
    backendModel: 'cogvideox-2b',
    description: 'نموذج فيديو أخف وأسرع — ZeroGPU',
    descriptionEn: 'Lighter, faster video model — ZeroGPU',
    icon: '📹',
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    available: true,
    stylePrefix: '',
    maxDuration: 6,
    supportsImageToVideo: false,
    speed: 3,
    quality: 4,
    estimatedTime: 90,
  },
  {
    id: 'hf-cogvideox-5b',
    name: 'كوغ فيديو إكس 5B',
    nameEn: 'CogVideoX-5B',
    provider: 'huggingface',
    backendModel: 'cogvideox-5b',
    description: 'أقوى نموذج لإنشاء فيديو عالي الجودة + دقة عالية',
    descriptionEn: 'Most powerful model for high-quality video + super-resolution',
    icon: '🎥',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    available: true,
    stylePrefix: '',
    maxDuration: 6,
    supportsImageToVideo: true,
    speed: 1,
    quality: 5,
    estimatedTime: 180,
  },
  {
    id: 'hf-ltx-video-distilled',
    name: 'إل تي إكس فيديو (نص لفيديو)',
    nameEn: 'LTX Video (T2V)',
    provider: 'huggingface',
    backendModel: 'ltx-video-distilled',
    description: 'نموذج سريع — نص لفيديو بدقة 704×512',
    descriptionEn: 'Fast text-to-video model at 704×512',
    icon: '🎞️',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
    available: true,
    stylePrefix: '',
    maxDuration: 2,
    supportsImageToVideo: false,
    speed: 4,
    quality: 4,
    estimatedTime: 60,
  },
  {
    id: 'hf-ltx-video-distilled-i2v',
    name: 'إل تي إكس فيديو (صورة لفيديو)',
    nameEn: 'LTX Video (I2V)',
    provider: 'huggingface',
    backendModel: 'ltx-video-distilled-i2v',
    description: 'حوّل صورة إلى فيديو بنموذج LTX السريع',
    descriptionEn: 'Transform an image into video with fast LTX model',
    icon: '🖼️',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
    available: true,
    stylePrefix: '',
    maxDuration: 2,
    supportsImageToVideo: true,
    speed: 4,
    quality: 4,
    estimatedTime: 60,
  },
  {
    id: 'hf-ltx-2-3',
    name: 'إل تي إكس 2.3 (مع صوت!)',
    nameEn: 'LTX 2.3 (with Audio!)',
    provider: 'huggingface',
    backendModel: 'ltx-2-3',
    description: 'أحدث نموذج من Lightricks — يولّد فيديو مع صوت! بدقة عالية',
    descriptionEn: 'Newest Lightricks model — generates video WITH SOUND! High res',
    icon: '🔊',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    available: true,
    stylePrefix: '',
    maxDuration: 3,
    supportsImageToVideo: true,
    speed: 2,
    quality: 5,
    estimatedTime: 150,
  },
  {
    id: 'hf-wan21-fast-i2v',
    name: 'وان 2.1 فاست (صورة لفيديو)',
    nameEn: 'Wan 2.1 Fast (I2V)',
    provider: 'huggingface',
    backendModel: 'wan21-fast-i2v',
    description: 'أسرع نموذج وان — 4 خطوات فقط! صورة لفيديو ZeroGPU',
    descriptionEn: 'Fastest Wan model — only 4 steps! I2V ZeroGPU',
    icon: '⚡',
    badgeColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    available: true,
    stylePrefix: '',
    maxDuration: 2,
    supportsImageToVideo: true,
    speed: 5,
    quality: 3,
    estimatedTime: 45,
  },
  {
    id: 'hf-stable-video-diffusion',
    name: 'ستيبل فيديو ديفيوجن',
    nameEn: 'Stable Video Diffusion',
    provider: 'huggingface',
    backendModel: 'stable-video-diffusion',
    description: 'نموذج Stability AI — صورة لفيديو بحركة طبيعية وسلسة',
    descriptionEn: 'Stability AI model — image to video with natural smooth motion',
    icon: '🎯',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    available: true,
    stylePrefix: '',
    maxDuration: 4,
    supportsImageToVideo: true,
    speed: 3,
    quality: 4,
    estimatedTime: 60,
  },
];

// ═══════════════════════════════════════════════════════════════════════
// Combined Exports
// ═══════════════════════════════════════════════════════════════════════

/** All video generation models available on the platform */
export const VIDEO_GEN_MODELS: VideoGenModel[] = [
  ...HF_VIDEO_MODEL_DEFS,
];

/** HuggingFace video models only (the only provider now) */
export const HF_VIDEO_MODELS: VideoGenModel[] = HF_VIDEO_MODEL_DEFS;

/** Default video model — CogVideoX-2B (fast, reliable, T2V) */
export const DEFAULT_VIDEO_MODEL = 'hf-cogvideox-2b';

// ═══════════════════════════════════════════════════════════════════════
// Lookup Functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get a video generation model by its unique ID.
 * Returns undefined if not found.
 */
export function getVideoGenModelById(id: string): VideoGenModel | undefined {
  return VIDEO_GEN_MODELS.find((m) => m.id === id);
}

/**
 * Get all video generation models for a specific provider.
 */
export function getVideoModelsByProvider(provider: VideoModelProvider): VideoGenModel[] {
  return VIDEO_GEN_MODELS.filter((m) => m.provider === provider);
}
