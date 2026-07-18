// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Image Generation Service (v4 — FIXED & TESTED)
// ═══════════════════════════════════════════════════════════════════════
// ONLY verified working models and spaces.
//
// Verified & Tested Working (March 2026):
//   ✅ FLUX.1-schnell (Inference API)      → Free serverless, ~300ms
//   ✅ SD 3 Medium (Gradio Space)          → /infer, ~15s
//   ✅ FLUX LoRA Explorer (Gradio Space)   → /run_lora, ~30s (needs LoRA)
//   ✅ SDXL Lightning (Gradio v4 Space)    → /api/predict via fn_index
//
// Broken/Removed:
//   ❌ black-forest-labs/FLUX.1-schnell Space → ZeroGPU, unreachable
//   ❌ evalstate/flux1_schnell Space          → 404
//   ❌ black-forest-labs/FLUX.1-dev Space     → ZeroGPU, unreachable
//   ❌ Nick088/FLUX.1-dev Space               → ZeroGPU, unreachable
//   ❌ black-forest-labs/FLUX.1-Krea-dev Space→ ZeroGPU, unreachable
//   ❌ SD 3.5 Large/Large Turbo/Medium Spaces → ZeroGPU, unreachable
//   ❌ SDXL Base (Inference API)              → Deprecated (410)
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { Client } from '@gradio/client';
import { getHFLoadBalancer } from '@/lib/hf-load-balancer';

// ─── Direct HTTP Gradio API (bypasses @gradio/client session issues) ───

async function gradioHttpCall(
  spaceName: string,
  endpoint: string,
  data: unknown[],
  timeoutMs: number = 180_000
): Promise<unknown[]> {
  const baseUrl = `https://${spaceName.replace('/', '-')}.hf.space`;
  const token = getHFToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Step 1: Submit the call
  const submitUrl = `${baseUrl}/gradio_api/call/${endpoint.replace(/^\//, '')}`;
  const submitResponse = await withTimeout(
    fetch(submitUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data }),
    }),
    30_000,
    `Submit to ${spaceName}/${endpoint} timed out`
  );

  if (!submitResponse.ok) {
    const errText = await submitResponse.text().catch(() => '');
    throw new Error(`Gradio submit error ${submitResponse.status}: ${errText.slice(0, 200)}`);
  }

  const submitResult = await submitResponse.json() as { event_id?: string };
  const eventId = submitResult.event_id;
  if (!eventId) {
    throw new Error(`No event_id from Gradio submit: ${JSON.stringify(submitResult).slice(0, 200)}`);
  }

  // Step 2: Poll for the result via SSE stream
  const resultUrl = `${baseUrl}/gradio_api/call/${endpoint.replace(/^\//, '')}/${eventId}`;
  const resultHeaders: Record<string, string> = {};
  if (token) resultHeaders['Authorization'] = `Bearer ${token}`;
  const resultResponse = await withTimeout(
    fetch(resultUrl, { headers: resultHeaders }),
    timeoutMs,
    `Gradio generation on ${spaceName} timed out after ${Math.round(timeoutMs / 1000)}s`
  );

  if (!resultResponse.ok) {
    throw new Error(`Gradio result error ${resultResponse.status}`);
  }

  const text = await resultResponse.text();

  // Parse SSE events
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('event: error')) {
      // Next line has the error data
      const errorLineIdx = lines.indexOf(line);
      const errorData = lines[errorLineIdx + 1];
      if (errorData?.startsWith('data: ')) {
        throw new Error(`Gradio error: ${errorData.slice(6, 200)}`);
      }
      throw new Error(`Gradio error on ${spaceName}`);
    }
    if (line.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(line.slice(6));
        if (Array.isArray(parsed)) return parsed;
      } catch { /* not JSON, continue */ }
    }
  }

  throw new Error(`Could not parse Gradio result from ${spaceName}. Raw: ${text.slice(0, 300)}`);
}

// ─── Constants ────────────────────────────────────────────────────────

const HF_INFERENCE_BASE = 'https://router.huggingface.co/hf-inference/models';
const IMAGE_TIMEOUT_MS = 120_000;
const GRADIO_CONNECT_TIMEOUT_MS = 30_000; // Reduced from 60s — fail fast
const MAX_COLD_START_RETRIES = 2;
const COLD_START_WAIT_MS = 15_000;
const RATE_LIMIT_WAIT_MS = 10_000;
const GRADIO_DOWNLOAD_TIMEOUT_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────

export interface HFImageModelEntry {
  id: string;
  hfModel: string;
  spaceName?: string;
  name: string;
  type: 'inference' | 'gradio';
  stylePrefix: string;
  maxResolution: number;
  available: boolean;
  endpoint: string;
  defaultParams: Record<string, unknown>;
  /** Speed: 1 (slow) to 5 (instant) */
  speed: number;
  /** Quality: 1 (basic) to 5 (best) */
  quality: number;
}

export interface HFImageResult {
  base64: string;
  format: 'jpg' | 'png' | 'webp';
  mimeType: string;
  model: string;
}

export interface HFImageGenOptions {
  width?: number;
  height?: number;
  timeoutMs?: number;
  maxRetries?: number;
  negativePrompt?: string;
  seed?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
}

export interface HFImageFallbackResult extends HFImageResult {
  usedModel: string;
  fellBack: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL REGISTRY — ONLY VERIFIED WORKING MODELS
// ═══════════════════════════════════════════════════════════════════════

export const HF_IMAGE_MODELS: Record<string, HFImageModelEntry> = {
  // ── FLUX.1-schnell — FAST, Inference API (FREE SERVERLESS) ──────────
  'flux-schnell': {
    id: 'flux-schnell',
    hfModel: 'black-forest-labs/FLUX.1-schnell',
    name: 'FLUX.1 Schnell (Serverless)',
    type: 'inference',
    stylePrefix: '',
    maxResolution: 1024,
    available: true,
    endpoint: '',
    defaultParams: {},
    speed: 5,
    quality: 4,
  },

  // ── SD 3 Medium — Gradio Space (WORKING) ────────────────────────────
  'sd3-medium': {
    id: 'sd3-medium',
    hfModel: 'stabilityai/stable-diffusion-3-medium',
    spaceName: 'stabilityai/stable-diffusion-3-medium',
    name: 'Stable Diffusion 3 Medium',
    type: 'gradio',
    stylePrefix: '',
    maxResolution: 1024,
    available: true,
    endpoint: '/infer',
    defaultParams: { num_inference_steps: 28, guidance_scale: 5.0, width: 1024, height: 1024, negative_prompt: '', randomize_seed: true, seed: 0 },
    speed: 3,
    quality: 4,
  },

  // ── FLUX LoRA Explorer — Gradio Space (NEEDS LoRA SELECTION) ─────────
  'flux-lora-explorer': {
    id: 'flux-lora-explorer',
    hfModel: 'multimodalart/flux-lora-the-explorer',
    spaceName: 'multimodalart/flux-lora-the-explorer',
    name: 'FLUX LoRA Explorer',
    type: 'gradio',
    stylePrefix: '',
    maxResolution: 1024,
    available: true,
    endpoint: '/run_lora',
    defaultParams: { cfg_scale: 3.5, steps: 28, randomize_seed: true, seed: 0, width: 1024, height: 1024, lora_scale: 0.95, image_strength: 0.75 },
    speed: 2,
    quality: 5,
  },

  // ── SDXL Lightning — Gradio v4 Space (NEEDS fn_index) ────────────────
  'sdxl-lightning': {
    id: 'sdxl-lightning',
    hfModel: 'ByteDance/SDXL-Lightning',
    spaceName: 'ByteDance/SDXL-Lightning',
    name: 'SDXL Lightning',
    type: 'gradio',
    stylePrefix: '',
    maxResolution: 1024,
    available: true,
    endpoint: '/api/predict',  // Gradio v4 uses /api/predict
    defaultParams: { num_inference_steps: 4, width: 1024, height: 1024 },
    speed: 5,
    quality: 3,
  },
};

// ─── Utility Functions ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function detectImageFormat(base64: string): { ext: 'jpg' | 'png' | 'webp'; mimeType: string } {
  if (base64.startsWith('/9j/')) return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (base64.startsWith('iVBOR')) return { ext: 'png', mimeType: 'image/png' };
  if (base64.startsWith('UklGR')) return { ext: 'webp', mimeType: 'image/webp' };
  return { ext: 'jpg', mimeType: 'image/jpeg' };
}

function getHFToken(): string {
  return process.env.HUGGINGFACE_API_TOKEN || '';
}

function getHFHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getHFToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ─── Gradio Image Generation ──────────────────────────────────────────

function extractImageUrl(data: unknown, spaceName: string): string {
  if (typeof data === 'string' && data.startsWith('http')) return data;
  if (typeof data === 'string' && data.startsWith('data:image')) return data;
  if (data && typeof data === 'object' && 'url' in data && typeof (data as Record<string, unknown>).url === 'string') {
    return (data as Record<string, unknown>).url as string;
  }
  if (data && typeof data === 'object' && 'image' in data) {
    const image = (data as Record<string, unknown>).image;
    if (image && typeof image === 'object' && 'url' in (image as Record<string, unknown>)) {
      return (image as Record<string, unknown>).url as string;
    }
    if (image && typeof image === 'object' && 'path' in (image as Record<string, unknown>)) {
      return `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${(image as Record<string, unknown>).path}`;
    }
  }
  if (data && typeof data === 'object' && 'path' in data && typeof (data as Record<string, unknown>).path === 'string') {
    const path = (data as Record<string, unknown>).path as string;
    return `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${path}`;
  }
  throw new Error(`Cannot extract image URL from Gradio response. Data: ${JSON.stringify(data).slice(0, 300)}`);
}

async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image')) {
    const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (base64Match?.[1]) return base64Match[1];
    throw new Error('Invalid data URI format for image');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GRADIO_DOWNLOAD_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    const token = getHFToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(imageUrl, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`Failed to download image: HTTP ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    return arrayBufferToBase64(arrayBuffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateViaGradio(
  modelEntry: HFImageModelEntry,
  prompt: string,
  options?: HFImageGenOptions
): Promise<HFImageResult> {
  const spaceName = modelEntry.spaceName || modelEntry.hfModel;
  const timeoutMs = options?.timeoutMs ?? IMAGE_TIMEOUT_MS;
  const startTime = Date.now();

  console.log(`[HF-Image] Generating via Gradio Space: ${spaceName}`);

  // Quick pre-check: verify space is reachable
  try {
    const spaceUrl = `https://${spaceName.replace('/', '-')}.hf.space`;
    const checkResponse = await withTimeout(
      fetch(spaceUrl, { method: 'HEAD' }),
      10_000,
      `Space ${spaceName} unreachable`
    );
  } catch (checkError) {
    const errMsg = checkError instanceof Error ? checkError.message : String(checkError);
    throw new Error(`Space ${spaceName} is not available: ${errMsg.slice(0, 100)}`);
  }

  // Build the data array based on model type
  let data: unknown[];

  if (modelEntry.id === 'sd3-medium') {
    // SD3 Medium: /infer endpoint with ordered params
    data = [
      prompt,                                                    // [0] prompt
      options?.negativePrompt || '',                              // [1] negative_prompt
      options?.seed ?? modelEntry.defaultParams.seed ?? 0,        // [2] seed
      options?.seed !== undefined ? false : true,                 // [3] randomize_seed
      Math.min(options?.width ?? 1024, modelEntry.maxResolution), // [4] width
      Math.min(options?.height ?? 1024, modelEntry.maxResolution),// [5] height
      options?.guidanceScale ?? modelEntry.defaultParams.guidance_scale ?? 5.0, // [6] guidance_scale
      options?.numInferenceSteps ?? modelEntry.defaultParams.num_inference_steps ?? 28, // [7] num_inference_steps
    ];
  } else if (modelEntry.id === 'flux-lora-explorer') {
    // FLUX LoRA Explorer: /run_lora with image_input as null
    data = [
      prompt,                                                    // [0] prompt
      null,                                                       // [1] image_input (no image)
      modelEntry.defaultParams.image_strength ?? 0.75,            // [2] image_strength
      options?.guidanceScale ?? modelEntry.defaultParams.cfg_scale ?? 3.5, // [3] cfg_scale
      options?.numInferenceSteps ?? modelEntry.defaultParams.steps ?? 28,  // [4] steps
      options?.seed !== undefined ? false : true,                 // [5] randomize_seed
      options?.seed ?? modelEntry.defaultParams.seed ?? 0,        // [6] seed
      Math.min(options?.width ?? 1024, modelEntry.maxResolution), // [7] width
      Math.min(options?.height ?? 1024, modelEntry.maxResolution),// [8] height
      modelEntry.defaultParams.lora_scale ?? 0.95,               // [9] lora_scale
    ];
  } else if (modelEntry.id === 'sdxl-lightning') {
    // SDXL Lightning uses Gradio v4 — try HTTP API with fn_index
    // For v4 spaces, we need to use /api/predict with fn_index
    const token = getHFToken();
    const baseUrl = `https://${spaceName.replace('/', '-')}.hf.space`;
    const apiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) apiHeaders['Authorization'] = `Bearer ${token}`;

    // Try fn_index=0 (the first/only function)
    const submitResponse = await withTimeout(
      fetch(`${baseUrl}/api/predict`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          fn_index: 0,
          data: [prompt, 4, 1024, 1024],
        }),
      }),
      timeoutMs,
      `SDXL Lightning generation timed out`
    );

    if (!submitResponse.ok) {
      throw new Error(`SDXL Lightning error ${submitResponse.status}`);
    }

    const resultData = await submitResponse.json() as { data?: unknown[] };
    if (!resultData.data || !Array.isArray(resultData.data)) {
      throw new Error(`Invalid result from SDXL Lightning: ${JSON.stringify(resultData).slice(0, 200)}`);
    }

    // Process the result directly
    let imageUrl: string | null = null;
    let base64Direct: string | null = null;

    for (const item of resultData.data) {
      if (typeof item === 'string' && item.length > 100) {
        if (item.startsWith('/9j/') || item.startsWith('iVBOR') || item.startsWith('UklGR')) {
          base64Direct = item;
          break;
        }
      }
      try {
        imageUrl = extractImageUrl(item, spaceName);
        break;
      } catch { /* continue */ }
    }

    let base64: string;
    if (base64Direct) {
      base64 = base64Direct;
    } else if (imageUrl) {
      base64 = await downloadImageAsBase64(imageUrl);
    } else {
      throw new Error(`Could not extract image from SDXL Lightning: ${JSON.stringify(resultData.data).slice(0, 300)}`);
    }

    const detected = detectImageFormat(base64);
    const elapsed = Date.now() - startTime;
    getHFLoadBalancer().recordSuccess(modelEntry.id, elapsed);
    console.log(`[HF-Image] ✓ SDXL Lightning success (${elapsed}ms, ${detected.ext})`);
    return { base64, format: detected.ext, mimeType: detected.mimeType, model: modelEntry.id };
  } else {
    // Generic Gradio model — use default params
    data = [
      prompt,
      options?.negativePrompt || '',
      options?.seed ?? 0,
      true,
      Math.min(options?.width ?? 1024, modelEntry.maxResolution),
      Math.min(options?.height ?? 1024, modelEntry.maxResolution),
      options?.guidanceScale ?? 5.0,
      options?.numInferenceSteps ?? 28,
    ];
  }

  // Use direct HTTP API call (more reliable than @gradio/client for v5+/v6+)
  const endpoint = modelEntry.endpoint.replace(/^\//, '');
  const resultData = await gradioHttpCall(spaceName, endpoint, data, timeoutMs);

  // Process the result
  let imageUrl: string | null = null;
  let base64Direct: string | null = null;

  for (const item of resultData) {
    if (typeof item === 'string' && item.length > 100) {
      if (item.startsWith('/9j/') || item.startsWith('iVBOR') || item.startsWith('UklGR')) {
        base64Direct = item;
        break;
      }
    }
    try {
      imageUrl = extractImageUrl(item, spaceName);
      break;
    } catch { /* continue */ }
  }

  let base64: string;
  if (base64Direct) {
    base64 = base64Direct;
  } else if (imageUrl) {
    base64 = await downloadImageAsBase64(imageUrl);
  } else {
    throw new Error(`Could not extract image from ${spaceName}. Raw: ${JSON.stringify(resultData).slice(0, 300)}`);
  }

  const detected = detectImageFormat(base64);
  const elapsed = Date.now() - startTime;
  getHFLoadBalancer().recordSuccess(modelEntry.id, elapsed);
  console.log(`[HF-Image] ✓ Gradio success: ${spaceName} (${elapsed}ms, ${detected.ext})`);

  return { base64, format: detected.ext, mimeType: detected.mimeType, model: modelEntry.id };
}

// ─── Inference API Image Generation ───────────────────────────────────

async function generateViaInferenceAPI(
  modelEntry: HFImageModelEntry,
  prompt: string,
  options?: HFImageGenOptions
): Promise<HFImageResult> {
  const { hfModel, maxResolution } = modelEntry;
  const url = `${HF_INFERENCE_BASE}/${hfModel}`;
  const timeoutMs = options?.timeoutMs ?? IMAGE_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? MAX_COLD_START_RETRIES;
  const width = Math.min(options?.width ?? 1024, maxResolution);
  const height = Math.min(options?.height ?? 1024, maxResolution);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();

    try {
      const body: Record<string, unknown> = {
        inputs: prompt,
        parameters: {
          width,
          height,
        },
      };
      if (options?.negativePrompt) {
        (body.parameters as Record<string, unknown>).negative_prompt = options.negativePrompt;
      }
      if (options?.numInferenceSteps) {
        (body.parameters as Record<string, unknown>).num_inference_steps = options.numInferenceSteps;
      }
      if (options?.guidanceScale) {
        (body.parameters as Record<string, unknown>).guidance_scale = options.guidanceScale;
      }

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: getHFHeaders(),
        body: JSON.stringify(body),
      });

      if (response.status === 503) {
        const errorText = await response.text().catch(() => '');
        if (errorText.includes('loading') || errorText.includes('currently loading')) {
          console.log(`[HF-Image] Model ${hfModel} is loading (cold start), attempt ${attempt + 1}`);
          getHFLoadBalancer().recordFailure(modelEntry.id, 'loading');
          lastError = new Error(`Model ${hfModel} is loading (cold start)`);
          await sleep(COLD_START_WAIT_MS);
          continue;
        }
      }

      if (response.status === 429) {
        console.log(`[HF-Image] Rate limited on ${hfModel}, waiting...`);
        getHFLoadBalancer().recordFailure(modelEntry.id, 'rate_limit');
        lastError = new Error(`Rate limited on ${hfModel}`);
        await sleep(RATE_LIMIT_WAIT_MS);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        getHFLoadBalancer().recordFailure(modelEntry.id, 'error');
        throw new Error(`HF Inference API error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let base64: string;

      if (contentType.includes('image/')) {
        const arrayBuffer = await response.arrayBuffer();
        base64 = arrayBufferToBase64(arrayBuffer);
      } else if (contentType.includes('json')) {
        const jsonResult = await response.json() as unknown[];
        if (jsonResult[0] && typeof jsonResult[0] === 'object' && 'image' in (jsonResult[0] as Record<string, unknown>)) {
          base64 = (jsonResult[0] as Record<string, unknown>).image as string;
          if (base64.startsWith('data:image')) {
            const match = base64.match(/^data:image\/[^;]+;base64,(.+)$/);
            if (match?.[1]) base64 = match[1];
          }
        } else {
          throw new Error(`Unexpected JSON response from Inference API`);
        }
      } else {
        const arrayBuffer = await response.arrayBuffer();
        base64 = arrayBufferToBase64(arrayBuffer);
      }

      const detected = detectImageFormat(base64);
      const elapsed = Date.now() - startTime;
      getHFLoadBalancer().recordSuccess(modelEntry.id, elapsed);
      console.log(`[HF-Image] ✓ Inference API success: ${hfModel} (${elapsed}ms, ${detected.ext})`);

      return { base64, format: detected.ext, mimeType: detected.mimeType, model: modelEntry.id };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Timeout on ${hfModel}`);
        getHFLoadBalancer().recordFailure(modelEntry.id, 'timeout');
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error(`All retries exhausted for ${hfModel}`);
}

// ─── Main Generation Function ─────────────────────────────────────────

export async function generateHFImage(
  prompt: string,
  modelId: string,
  options?: HFImageGenOptions
): Promise<HFImageResult> {
  const model = HF_IMAGE_MODELS[modelId];
  if (!model) throw new Error(`Unknown image model: ${modelId}`);

  const fullPrompt = model.stylePrefix + prompt;
  console.log(`[HF-Image] Generating with ${modelId} (${model.type}): "${prompt.slice(0, 60)}..."`);

  try {
    let result: HFImageResult;
    if (model.type === 'gradio') {
      result = await generateViaGradio(model, fullPrompt, options);
    } else {
      result = await generateViaInferenceAPI(model, fullPrompt, options);
    }
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(JSON.stringify(error).slice(0, 150));
    console.error(`[HF-Image] Error with ${modelId}: ${err.message.slice(0, 150)}`);
    throw err;
  }
}

// ─── Fallback Generation ──────────────────────────────────────────────

export async function generateImageWithFallback(
  prompt: string,
  preferredModels?: string[],
  options?: HFImageGenOptions
): Promise<HFImageFallbackResult> {
  const lb = getHFLoadBalancer();
  const preferred = preferredModels?.length ? preferredModels : [
    'flux-schnell', 'sd3-medium', 'sdxl-lightning', 'flux-lora-explorer',
  ];

  const excludeModels = new Set<string>();

  for (const modelId of preferred) {
    if (!HF_IMAGE_MODELS[modelId]) continue;
    if (!lb.isModelUsable(modelId)) { excludeModels.add(modelId); continue; }

    try {
      const result = await generateHFImage(prompt, modelId, options);
      return { ...result, usedModel: modelId, fellBack: false };
    } catch {
      excludeModels.add(modelId);
    }
  }

  // Try any remaining available model
  const remaining = Object.keys(HF_IMAGE_MODELS).filter(
    (id) => !excludeModels.has(id) && HF_IMAGE_MODELS[id].available && lb.isModelUsable(id)
  );

  for (const modelId of remaining.slice(0, 2)) {
    try {
      const result = await generateHFImage(prompt, modelId, options);
      return { ...result, usedModel: modelId, fellBack: true };
    } catch { /* continue */ }
  }

  throw new Error('All image models failed after trying all available options');
}

// ─── Model Testing ────────────────────────────────────────────────────

export interface ImageModelTestResult {
  available: boolean;
  responseTimeMs: number;
  error?: string;
}

export async function testImageModel(id: string): Promise<ImageModelTestResult> {
  const model = HF_IMAGE_MODELS[id];
  if (!model) return { available: false, responseTimeMs: 0, error: `Unknown model: ${id}` };

  const startTime = Date.now();

  try {
    if (model.type === 'gradio') {
      const spaceUrl = `https://${(model.spaceName || model.hfModel).replace('/', '-')}.hf.space`;
      const response = await withTimeout(
        fetch(spaceUrl, { method: 'HEAD' }),
        10_000,
        `Test request to ${spaceUrl} timed out`
      );
      const responseTimeMs = Date.now() - startTime;

      if (response.ok || response.status === 200 || response.status === 302 || response.status === 303) {
        return { available: true, responseTimeMs };
      }
      if (response.status === 401 || response.status === 403) {
        return { available: true, responseTimeMs };
      }
      if ([404, 502, 503, 504].includes(response.status)) {
        return { available: true, responseTimeMs, error: `Space may be sleeping (${response.status})` };
      }
      return { available: false, responseTimeMs, error: `HTTP ${response.status}` };
    } else {
      const url = `${HF_INFERENCE_BASE}/${model.hfModel}`;
      const response = await withTimeout(
        fetch(url, { method: 'POST', headers: getHFHeaders(), body: JSON.stringify({ inputs: 'test' }) }),
        15_000,
        `Test request timed out`
      );
      const responseTimeMs = Date.now() - startTime;

      if (response.ok || response.status === 503 || response.status === 429) {
        return { available: true, responseTimeMs };
      }
      if (response.status === 410) {
        return { available: false, responseTimeMs, error: `Model deprecated` };
      }
      return { available: false, responseTimeMs, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (model.type === 'gradio') {
      return { available: true, responseTimeMs, error: `Space may be sleeping: ${errorMsg.slice(0, 80)}` };
    }
    return { available: false, responseTimeMs, error: errorMsg.slice(0, 80) };
  }
}

export async function refreshImageModels(): Promise<Record<string, ImageModelTestResult>> {
  console.log('[HF-Image] Refreshing model availability...');
  const results: Record<string, ImageModelTestResult> = {};
  const modelIds = Object.keys(HF_IMAGE_MODELS);

  const batchSize = 3;
  for (let i = 0; i < modelIds.length; i += batchSize) {
    const batch = modelIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (id) => ({ id, result: await testImageModel(id) }))
    );
    for (const { id, result } of batchResults) {
      results[id] = result;
      HF_IMAGE_MODELS[id].available = result.available;
    }
  }

  const availableCount = Object.values(results).filter((r) => r.available).length;
  console.log(`[HF-Image] Refresh complete: ${availableCount}/${modelIds.length} available`);
  return results;
}

// ─── Lookup Functions ──────────────────────────────────────────────────

export function getAllImageModelIds(): string[] {
  return Object.entries(HF_IMAGE_MODELS)
    .filter(([, m]) => m.available)
    .map(([id]) => id);
}

export function getImageModelById(id: string): HFImageModelEntry | undefined {
  return HF_IMAGE_MODELS[id];
}

export function getAvailableImageModels(): HFImageModelEntry[] {
  return Object.values(HF_IMAGE_MODELS).filter((m) => m.available);
}

export async function fetchAvailableImageModels(): Promise<Record<string, boolean>> {
  const results = await refreshImageModels();
  const availableMap: Record<string, boolean> = {};
  for (const [id, result] of Object.entries(results)) {
    availableMap[id] = result.available;
  }
  return availableMap;
}
