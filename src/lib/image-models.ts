/**
 * Image Generation Models — DeltaAI Platform
 *
 * Defines all REAL image generation models available across providers:
 * - Pollinations (free, no API key needed)
 * - HuggingFace (free with token, many open-source models)
 * - GitHub (DALL-E 3 via GitHub Models, free with token)
 * - ZhipuAI (only cogview-3-flash has remaining credits)
 *
 * REMOVED providers:
 * ❌ Gemini — API key expired, all models return 404
 *
 * REMOVED models:
 * ❌ Pollinations kontext — HTTP 500 on free endpoint
 * ❌ ZhipuAI cogview-4, cogview-3-plus, cogview-3 — insufficient credits
 */

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type ImageModelProvider = 'pollinations' | 'huggingface' | 'zhipuai' | 'zai' | 'github';

export interface ImageGenModel {
  /** Unique ID for this model (e.g., 'pollinations-flux') */
  id: string;
  /** Arabic name */
  name: string;
  /** English name */
  nameEn: string;
  /** Which provider powers this model */
  provider: ImageModelProvider;
  /** The real backend model ID for the provider */
  backendModel: string;
  /** Short description of the model's style/specialty (Arabic) */
  description: string;
  /** Short description of the model's style/specialty (English) */
  descriptionEn: string;
  /** Icon/emoji for the model */
  icon: string;
  /** Badge color class for UI */
  badgeColor: string;
  /** Whether this model is available (confirmed working) */
  available: boolean;
  /** Style prefix injected into prompts for this model */
  stylePrefix: string;
  /** Maximum resolution supported */
  maxResolution: string;
  /** Whether the model supports image editing */
  supportsEdit: boolean;
  /** Speed rating: 1 (slow) to 5 (instant) */
  speed: number;
  /** Quality rating: 1 (basic) to 5 (best) */
  quality: number;
}

// ────────────────────────────────────────────────────────────────
// Model Definitions
// ────────────────────────────────────────────────────────────────

const POLLINATIONS_IMAGE_MODELS: ImageGenModel[] = [
  {
    id: 'pollinations-flux',
    name: 'فلوكس',
    nameEn: 'Flux',
    provider: 'pollinations',
    backendModel: 'flux',
    description: 'نموذج احترافي عالي الجودة لتوليد الصور الواقعية والفنية',
    descriptionEn: 'Professional high-quality model for realistic and artistic image generation',
    icon: '🎨',
    badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
    available: true,
    stylePrefix: 'professional high-quality, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
  {
    id: 'pollinations-gptimage',
    name: 'جي بي تي إيميج',
    nameEn: 'GPT Image',
    provider: 'pollinations',
    backendModel: 'gptimage',
    description: 'نموذج متعدد الاستخدامات يناسب جميع أنواع الصور',
    descriptionEn: 'Versatile model suitable for all types of images',
    icon: '🖼️',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    available: true,
    stylePrefix: 'versatile detailed, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
  {
    id: 'pollinations-gpt-image-2',
    name: 'جي بي تي إيميج 2',
    nameEn: 'GPT Image 2',
    provider: 'pollinations',
    backendModel: 'gpt-image-2',
    description: 'نموذج متقدم ينتج صورًا فوتوغرافية واقعية بتفاصيل مذهلة',
    descriptionEn: 'Advanced model producing photorealistic images with stunning detail',
    icon: '📸',
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    available: true,
    stylePrefix: 'photorealistic ultra-detailed, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 2,
    quality: 5,
  },
  {
    id: 'pollinations-seedream5',
    name: 'سيديريم 5',
    nameEn: 'Seedream 5',
    provider: 'pollinations',
    backendModel: 'seedream5',
    description: 'نموذج من بايت دانس بأسلوب سينمائي مذهل',
    descriptionEn: 'ByteDance model with stunning cinematic style',
    icon: '🎬',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
    available: true,
    stylePrefix: 'cinematic dramatic lighting, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
  {
    id: 'pollinations-seedream-pro',
    name: 'سيديريم برو',
    nameEn: 'Seedream Pro',
    provider: 'pollinations',
    backendModel: 'seedream-pro',
    description: 'نسخة احترافية بجودة ممتازة وتفاصيل فائقة',
    descriptionEn: 'Premium version with excellent quality and super-fine details',
    icon: '💎',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    available: true,
    stylePrefix: 'premium ultra-detailed, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 2,
    quality: 5,
  },
  {
    id: 'pollinations-zimage',
    name: 'زي-إيميج',
    nameEn: 'Z-Image',
    provider: 'pollinations',
    backendModel: 'zimage',
    description: 'نموذج متميز للفن الرقمي والتصاميم الإبداعية',
    descriptionEn: 'Excellent model for digital art and creative designs',
    icon: '✨',
    badgeColor: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200',
    available: true,
    stylePrefix: 'digital art creative, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
  {
    id: 'pollinations-nova-canvas',
    name: 'نوفا كانفاس',
    nameEn: 'Nova Canvas',
    provider: 'pollinations',
    backendModel: 'nova-canvas',
    description: 'نموذج أمازون للفن الكلاسيكي واللوحات الفنية',
    descriptionEn: 'Amazon model for classic art and artistic paintings',
    icon: '🏛️',
    badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    available: true,
    stylePrefix: 'classic art painting style, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
  {
    id: 'pollinations-grok-imagine',
    name: 'جروك إيمجين',
    nameEn: 'Grok Imagine',
    provider: 'pollinations',
    backendModel: 'grok-imagine',
    description: 'نموذج xAI الإبداعي لتوليد صور فريدة ومبتكرة',
    descriptionEn: 'xAI creative model for generating unique and innovative images',
    icon: '🌀',
    badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    available: true,
    stylePrefix: 'creative imaginative, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
  {
    id: 'pollinations-grok-imagine-pro',
    name: 'جروك إيمجين برو',
    nameEn: 'Grok Imagine Pro',
    provider: 'pollinations',
    backendModel: 'grok-imagine-pro',
    description: 'نسخة احترافية من جروك بتفاصيل إبداعية أعلى',
    descriptionEn: 'Pro version of Grok with higher creative detail',
    icon: '🌟',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    available: true,
    stylePrefix: 'creative highly detailed, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 2,
    quality: 5,
  },
  {
    id: 'pollinations-qwen-image',
    name: 'كوين إيميج',
    nameEn: 'Qwen Image',
    provider: 'pollinations',
    backendModel: 'qwen-image',
    description: 'نموذج علي بابا الفني لتوليد صور بأسلوب فني مميز',
    descriptionEn: 'Alibaba artistic model for generating images with distinctive artistic style',
    icon: '🎭',
    badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    available: true,
    stylePrefix: 'artistic stylized, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
];

// ── REMOVED Pollinations models ──────
// ❌ pollinations-kontext → HTTP 500 on free endpoint

const HUGGINGFACE_IMAGE_MODELS: ImageGenModel[] = [
  {
    id: 'hf-flux-schnell',
    name: 'فلوكس شنيل',
    nameEn: 'FLUX.1 Schnell',
    provider: 'huggingface',
    backendModel: 'black-forest-labs/FLUX.1-schnell',
    description: 'أسرع نموذج فلوكس — نتائج فورية بجودة عالية من HuggingFace',
    descriptionEn: 'Fastest FLUX model — instant results with high quality from HuggingFace',
    icon: '⚡',
    badgeColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    available: true,
    stylePrefix: 'high quality, detailed, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 4,
    quality: 4,
  },
];

// ── REMOVED HuggingFace models ──────
// ❌ hf-sdxl (stabilityai/stable-diffusion-xl-base-1.0) → 410 deprecated
// ❌ hf-sd3-medium (stabilityai/stable-diffusion-3-medium) → 400 not supported
// ❌ hf-playground (playgroundai/playground-v2.5-1024px-aesthetic) → 400 not supported

const GITHUB_IMAGE_MODELS: ImageGenModel[] = [];

// ── REMOVED GitHub models ──────
// ❌ github-dalle3 → token expired (401), API returns unauthorized

const ZHIPUAI_IMAGE_MODELS: ImageGenModel[] = [
  {
    id: 'zhipuai-cogview-3-flash',
    name: 'كوغ فيو 3 فلاش',
    nameEn: 'CogView 3 Flash',
    provider: 'zhipuai',
    backendModel: 'cogview-3-flash',
    description: 'أسرع نموذج كوغ فيو — نتائج فورية',
    descriptionEn: 'Fastest CogView model — instant results',
    icon: '🐇',
    badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    available: true,
    stylePrefix: '',
    maxResolution: '512x512',
    supportsEdit: false,
    speed: 5,
    quality: 3,
  },
];

// ── REMOVED ZhipuAI models (insufficient credits) ──────
// ❌ zhipuai-cogview-4       → 429 余额不足
// ❌ zhipuai-cogview-3-plus  → 429 余额不足
// ❌ zhipuai-cogview-3       → 429 余额不足

const ZAI_IMAGE_MODELS: ImageGenModel[] = [
  {
    id: 'zai-standard',
    name: 'زي-إيه-آي ستاندرد',
    nameEn: 'Z-AI Standard',
    provider: 'zai',
    backendModel: 'z-ai-standard',
    description: 'نموذج موثوق وعالي الجودة لتوليد الصور المتنوعة',
    descriptionEn: 'Reliable high-quality model for diverse image generation',
    icon: '🤖',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    available: true,
    stylePrefix: 'high quality, detailed, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 4,
  },
  {
    id: 'zai-photorealistic',
    name: 'زي-إيه-آي فوتو',
    nameEn: 'Z-AI Photo',
    provider: 'zai',
    backendModel: 'z-ai-photo',
    description: 'نموذج متخصص في الصور الواقعية والفوتوغرافية',
    descriptionEn: 'Specialized in photorealistic and photographic images',
    icon: '📷',
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    available: true,
    stylePrefix: 'photorealistic, ultra-detailed, ',
    maxResolution: '1024x1024',
    supportsEdit: false,
    speed: 3,
    quality: 5,
  },
];

// ── REMOVED provider ──────
// ❌ Gemini — API key expired, all models return 404

// ────────────────────────────────────────────────────────────────
// Aggregated Exports
// ────────────────────────────────────────────────────────────────

/** All image generation models across all providers */
export const IMAGE_GEN_MODELS: ImageGenModel[] = [
  ...POLLINATIONS_IMAGE_MODELS,
  ...HUGGINGFACE_IMAGE_MODELS,
  ...GITHUB_IMAGE_MODELS,
  ...ZHIPUAI_IMAGE_MODELS,
  ...ZAI_IMAGE_MODELS,
];

// ────────────────────────────────────────────────────────────────
// Lookup / Filter Helpers
// ────────────────────────────────────────────────────────────────

/**
 * Look up an image generation model by its unique ID.
 * Returns `undefined` if not found.
 */
export function getImageGenModelById(id: string): ImageGenModel | undefined {
  return IMAGE_GEN_MODELS.find((m) => m.id === id);
}

/**
 * Filter image generation models by provider.
 */
export function getModelsByProvider(provider: ImageModelProvider): ImageGenModel[] {
  return IMAGE_GEN_MODELS.filter((m) => m.provider === provider);
}

// ────────────────────────────────────────────────────────────────
// Re-export per-provider arrays for convenience
// ────────────────────────────────────────────────────────────────

export { POLLINATIONS_IMAGE_MODELS, HUGGINGFACE_IMAGE_MODELS, GITHUB_IMAGE_MODELS, ZHIPUAI_IMAGE_MODELS, ZAI_IMAGE_MODELS };

// ── Legacy re-exports (empty arrays, for backward compat in imports) ──
export const GEMINI_IMAGE_MODELS: ImageGenModel[] = [];
