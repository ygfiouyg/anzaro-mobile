/**
 * Shared HuggingFace Model ID Resolution Utilities
 * 
 * Used across:
 * - src/app/api/admin/custom-models/route.ts
 * - src/app/api/ai/image/route.ts
 * - src/app/api/ai/video/route.ts
 * - src/app/api/chat/stream/route.ts
 */

// ─── Map of short/alias model IDs to full HuggingFace paths ─────────
export const HF_MODEL_ID_MAP: Record<string, string> = {
  'flux-schnell': 'black-forest-labs/FLUX.1-schnell',
  'flux.1-schnell': 'black-forest-labs/FLUX.1-schnell',
  'flux.1_schnell': 'black-forest-labs/FLUX.1-schnell',
  'flux-1-schnell': 'black-forest-labs/FLUX.1-schnell',
  'flux-dev': 'black-forest-labs/FLUX.1-dev',
  'flux.1-dev': 'black-forest-labs/FLUX.1-dev',
  'sdxl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'stable-diffusion-xl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'sd-xl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'stable-diffusion-3': 'stabilityai/stable-diffusion-3-medium',
  'sd3': 'stabilityai/stable-diffusion-3-medium',
  'playground-v2.5': 'playgroundai/playground-v2.5-1024px-aesthetic',
  'wan-2.1-fast': 'Wan-AI/Wan2.1-T2V-1.3B',
  'wan2.1-fast': 'Wan-AI/Wan2.1-T2V-1.3B',
  'wan-2.1-i2v': 'Wan-AI/Wan2.1-I2V-14B-480P',
  'wan2.1-i2v': 'Wan-AI/Wan2.1-I2V-14B-480P',
  'cogvideox-2b': 'THUDM/CogVideoX-2B',
  'cogvideox-5b': 'THUDM/CogVideoX-5B',
  'hunyuan-video': 'tencent/HunyuanVideo',
  'hunyuanvideo': 'tencent/HunyuanVideo',
  'animatediff-lightning': 'ByteDance/AnimateDiff-Lightning',
  'whisper-large-v3': 'openai/whisper-large-v3',
  'whisper-large': 'openai/whisper-large-v3',
};

// Default model IDs when the modelId is missing for HF endpoints
export const HF_DEFAULT_MODEL_IDS: Record<string, string> = {
  chat: 'meta-llama/Llama-3.1-8B-Instruct',
  image: 'black-forest-labs/FLUX.1-schnell',
  video: 'THUDM/CogVideoX-2B',
  asr: 'openai/whisper-large-v3',
  translation: 'Helsinki-NLP/opus-mt-en-ar',
};

/**
 * Resolve short/incomplete HF model IDs to full organization/model paths.
 * If the modelId already contains a '/', it's already a full path.
 */
export function resolveHFModelId(modelId: string | null | undefined): string | null {
  if (!modelId) return null;
  if (modelId.includes('/')) return modelId; // Already full path
  const lower = modelId.toLowerCase().replace(/\s+/g, '-');
  return HF_MODEL_ID_MAP[lower] || HF_MODEL_ID_MAP[modelId] || null;
}

/**
 * Build the correct HuggingFace Inference API URL for a model.
 * Resolves short model IDs and constructs the proper URL.
 */
export function buildHFInferenceUrl(baseUrl: string, modelId: string | null | undefined): string {
  const resolvedId = resolveHFModelId(modelId);
  if (resolvedId) {
    return `https://api-inference.huggingface.co/models/${resolvedId}`;
  }
  if (baseUrl.includes('/models/') && baseUrl.includes('huggingface.co')) {
    return baseUrl; // Already a valid HF inference URL
  }
  return baseUrl;
}

/**
 * Fix the baseUrl and apiFormat for HuggingFace models based on category.
 * Also resolves short model IDs to full paths.
 */
export function fixHFBaseUrl(
  baseUrl: string,
  modelId: string | null,
  category: string,
  apiFormat: string,
  provider: string
): { baseUrl: string; apiFormat: string; modelId: string } {
  // Resolve short model IDs to full paths
  let resolvedModelId = resolveHFModelId(modelId) || modelId;

  // If modelId is still null and this is an HF endpoint, assign a default modelId
  if (!resolvedModelId && provider === 'huggingface') {
    resolvedModelId = HF_DEFAULT_MODEL_IDS[category] || null;
    if (resolvedModelId) {
      console.log(`[fixHFBaseUrl] No modelId for HF ${category} endpoint — using default: ${resolvedModelId}`);
    }
  }

  // Also detect HF endpoints by URL pattern even if provider doesn't say huggingface
  const isHFUrl = baseUrl.includes('huggingface.co') || baseUrl.includes('hf.co');
  if (!resolvedModelId && isHFUrl) {
    resolvedModelId = HF_DEFAULT_MODEL_IDS[category] || null;
    if (resolvedModelId) {
      console.log(`[fixHFBaseUrl] No modelId for HF-like URL ${category} — using default: ${resolvedModelId}`);
    }
  }

  // If the baseUrl is a generic router URL and the model needs HF Inference, fix it
  if (apiFormat === 'hf-inference' && resolvedModelId) {
    if (baseUrl.includes('router.huggingface.co/v1') || baseUrl === 'https://router.huggingface.co') {
      if (category === 'chat') {
        // Chat models should use OpenAI format via router
        return { baseUrl: 'https://router.huggingface.co/v1', apiFormat: 'openai', modelId: resolvedModelId };
      } else {
        // Image/video models need the direct inference URL
        return { baseUrl: `https://api-inference.huggingface.co/models/${resolvedModelId}`, apiFormat: 'hf-inference', modelId: resolvedModelId };
      }
    }
  }

  // Also fix openai-format HF endpoints that are missing a modelId
  if (apiFormat === 'openai' && isHFUrl && !resolvedModelId) {
    resolvedModelId = HF_DEFAULT_MODEL_IDS[category] || null;
  }

  return { baseUrl, apiFormat, modelId: resolvedModelId || modelId || '' };
}
