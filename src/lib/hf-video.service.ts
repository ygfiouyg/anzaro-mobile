// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Video Generation Service (v4 — FIXED & TESTED)
// ═══════════════════════════════════════════════════════════════════════
// ONLY verified working Spaces with correct API endpoints.
// Uses direct HTTP Gradio API for reliability (bypasses @gradio/client issues).
//
// Verified & Tested Working (March 2026):
//   ✅ CogVideoX-2B      → /generate (T2V only, simple params)
//   ✅ CogVideoX-5B      → /generate (T2V + I2V + V2V)
//   ✅ LTX-Video Distilled → /text_to_video (T2V), /image_to_video (I2V)
//   ✅ LTX-2-3           → /generate_video (I2V with prompt)
//   ✅ Wan2.1 Fast       → /generate_video (I2V with prompt)
//
// Broken/Removed:
//   ❌ Wan-AI/Wan2.1              → ZeroGPU unreachable
//   ❌ alexnasa/ltx-2-TURBO       → RuntimeError
//   ❌ multimodalart/wan-2-2-first-last-frame → Frame interpolation only
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { Client } from '@gradio/client';
import { getHFLoadBalancer } from '@/lib/hf-load-balancer';

// ─── Environment ──────────────────────────────────────────────────────

const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';

// ─── Timeouts ─────────────────────────────────────────────────────────

const VIDEO_GENERATION_TIMEOUT_MS = 300_000; // 5 min
const GRADIO_CONNECT_TIMEOUT_MS = 30_000;
const MODEL_TEST_TIMEOUT_MS = 10_000;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface HFVideoModelEntry {
  id: string;
  spaceName: string;
  name: string;
  type: 'gradio' | 'inference' | 'zhipuai';
  endpoint: string;
  defaultParams: Record<string, unknown>;
  supportedModes: ('text2video' | 'image2video')[];
  stylePrefix: string;
  avgWaitTime: number;
  available: boolean;
  speed: number;
  quality: number;
}

export interface HFVideoGenerateOptions {
  duration?: number;
  image_url?: string;
  seed?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
  width?: number;
  height?: number;
  fps?: number;
  returnBase64?: boolean;
  signal?: AbortSignal;
}

export interface HFVideoResult {
  videoUrl: string;
  base64?: string;
  model: string;
  durationMs: number;
}

export interface HFVideoFallbackResult extends HFVideoResult {
  attemptedModels: string[];
  usedFallback: boolean;
}

export interface VideoModelTestResult {
  available: boolean;
  responseTimeMs: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

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

// ─── Direct HTTP Gradio API ──────────────────────────────────────────

async function gradioHttpCall(
  spaceName: string,
  endpoint: string,
  data: unknown[],
  timeoutMs: number = 300_000
): Promise<unknown[]> {
  const baseUrl = `https://${spaceName.replace('/', '-')}.hf.space`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

  // Step 1: Submit
  const submitUrl = `${baseUrl}/gradio_api/call/${endpoint.replace(/^\//, '')}`;
  const submitResponse = await withTimeout(
    fetch(submitUrl, { method: 'POST', headers, body: JSON.stringify({ data }) }),
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

  // Step 2: Get result via SSE
  const resultUrl = `${baseUrl}/gradio_api/call/${endpoint.replace(/^\//, '')}/${eventId}`;
  const resultHeaders: Record<string, string> = {};
  if (HF_TOKEN) resultHeaders['Authorization'] = `Bearer ${HF_TOKEN}`;
  const resultResponse = await withTimeout(
    fetch(resultUrl, { headers: resultHeaders }),
    timeoutMs,
    `Video generation on ${spaceName} timed out after ${Math.round(timeoutMs / 1000)}s`
  );

  if (!resultResponse.ok) {
    throw new Error(`Gradio result error ${resultResponse.status}`);
  }

  const text = await resultResponse.text();

  // Parse SSE events
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('event: error')) {
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

export function extractVideoUrl(data: unknown, spaceName: string): string {
  if (!data || data === null) throw new Error('Cannot extract video URL from null data');

  if (typeof data === 'string') {
    if (data.startsWith('http')) return data;
    if (data.startsWith('/')) return `https://${spaceName.replace('/', '-')}.hf.space/file=${data}`;
    if (data.startsWith('data:')) return data;
  }

  if (typeof data !== 'object') throw new Error(`Cannot extract video URL from: ${typeof data}`);

  const obj = data as Record<string, unknown>;

  if ('url' in obj && typeof obj.url === 'string' && obj.url.length > 0) return obj.url;
  if ('video' in obj && typeof obj.video === 'object' && obj.video !== null) {
    const video = obj.video as Record<string, unknown>;
    if ('url' in video && typeof video.url === 'string') return video.url;
    if ('path' in video && typeof video.path === 'string') return `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${video.path}`;
  }
  if ('path' in obj && typeof obj.path === 'string' && obj.path.length > 0) {
    const path = obj.path as string;
    if (path.startsWith('http')) return path;
    return `https://${spaceName.replace('/', '-')}.hf.space/gradio_api/file=${path}`;
  }
  if ('is_stream' in obj && typeof obj.url === 'string') return obj.url;

  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.startsWith('http') && (value.includes('.mp4') || value.includes('video'))) {
      return value;
    }
  }

  throw new Error(`Cannot extract video URL. Data: ${JSON.stringify(data).slice(0, 300)}`);
}

export async function downloadVideoAsBase64(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const headers: Record<string, string> = {};
    if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`Failed to download video: HTTP ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return Buffer.from(binary, 'binary').toString('base64');
  } finally {
    clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL REGISTRY — ONLY VERIFIED WORKING MODELS
// ═══════════════════════════════════════════════════════════════════════

export const HF_VIDEO_MODELS: Record<string, HFVideoModelEntry> = {
  // ── CogVideoX-2B — LIGHTWEIGHT T2V (ZeroGPU) ───────────────────────
  'cogvideox-2b': {
    id: 'cogvideox-2b',
    spaceName: 'zai-org/CogVideoX-2B-Space',
    name: 'CogVideoX-2B',
    type: 'gradio',
    endpoint: '/generate',
    defaultParams: {
      num_inference_steps: 50,
      guidance_scale: 6.0,
    },
    supportedModes: ['text2video'],
    stylePrefix: 'Detailed, smooth motion, ',
    avgWaitTime: 60,
    available: true,
    speed: 3,
    quality: 4,
  },

  // ── CogVideoX-5B — HIGH QUALITY (ZeroGPU) ──────────────────────────
  'cogvideox-5b': {
    id: 'cogvideox-5b',
    spaceName: 'zai-org/CogVideoX-5B-Space',
    name: 'CogVideoX-5B',
    type: 'gradio',
    endpoint: '/generate',
    defaultParams: {
      seed_value: -1,
      scale_status: false,
      rife_status: false,
    },
    supportedModes: ['text2video', 'image2video'],
    stylePrefix: 'High quality, cinematic, ',
    avgWaitTime: 90,
    available: true,
    speed: 1,
    quality: 5,
  },

  // ── LTX-Video Distilled — FAST T2V+I2V (ZeroGPU) ──────────────────
  'ltx-video-distilled': {
    id: 'ltx-video-distilled',
    spaceName: 'Lightricks/ltx-video-distilled',
    name: 'LTX Video Distilled (T2V)',
    type: 'gradio',
    endpoint: '/text_to_video',
    defaultParams: {
      negative_prompt: '',
      input_image_filepath: '',
      input_video_filepath: '',
      height_ui: 512,
      width_ui: 704,
      mode: 'text2video',
      duration_ui: 2,
      ui_frames_to_use: 0,
      seed_ui: 42,
      randomize_seed: true,
      ui_guidance_scale: 1,
      improve_texture_flag: true,
    },
    supportedModes: ['text2video'],
    stylePrefix: 'High fidelity, cinematic, ',
    avgWaitTime: 40,
    available: true,
    speed: 4,
    quality: 4,
  },

  'ltx-video-distilled-i2v': {
    id: 'ltx-video-distilled-i2v',
    spaceName: 'Lightricks/ltx-video-distilled',
    name: 'LTX Video I2V',
    type: 'gradio',
    endpoint: '/image_to_video',
    defaultParams: {
      negative_prompt: '',
      input_video_filepath: '',
      height_ui: 512,
      width_ui: 704,
      mode: 'image2video',
      duration_ui: 2,
      ui_frames_to_use: 0,
      seed_ui: 42,
      randomize_seed: true,
      ui_guidance_scale: 1,
      improve_texture_flag: true,
    },
    supportedModes: ['image2video'],
    stylePrefix: 'Animate this image smoothly, ',
    avgWaitTime: 40,
    available: true,
    speed: 4,
    quality: 4,
  },

  // ── LTX-2-3 — With audio (ZeroGPU) ────────────────────────────────
  'ltx-2-3': {
    id: 'ltx-2-3',
    spaceName: 'Lightricks/LTX-2-3',
    name: 'LTX 2.3 (with Audio!)',
    type: 'gradio',
    endpoint: '/generate_video',
    defaultParams: {
      duration: 3.0,
      enhance_prompt: false,
      seed: 10,
      randomize_seed: true,
      height: 1024,
      width: 1536,
    },
    supportedModes: ['text2video', 'image2video'],
    stylePrefix: 'Cinematic, high quality, ',
    avgWaitTime: 80,
    available: true,
    speed: 2,
    quality: 5,
  },

  // ── Wan2.1 Fast — I2V (ZeroGPU) ───────────────────────────────────
  'wan21-fast-i2v': {
    id: 'wan21-fast-i2v',
    spaceName: 'multimodalart/wan2-1-fast',
    name: 'Wan 2.1 Fast (I2V)',
    type: 'gradio',
    endpoint: '/generate_video',
    defaultParams: {
      height: 512,
      width: 896,
      negative_prompt: '',
      duration_seconds: 2,
      guidance_scale: 1.0,
      steps: 4,
      seed: 42,
      randomize_seed: true,
    },
    supportedModes: ['image2video'],
    stylePrefix: 'Animate this image, cinematic motion, ',
    avgWaitTime: 30,
    available: true,
    speed: 5,
    quality: 3,
  },

  // ── Stable Video Diffusion — Image-to-Video (I2V ONLY, may be sleeping) ───
  'stable-video-diffusion': {
    id: 'stable-video-diffusion',
    spaceName: 'multimodalart/stable-video-diffusion',
    name: 'Stable Video Diffusion',
    type: 'gradio',
    endpoint: '/video',
    defaultParams: {
      seed: 42,
      randomize_seed: true,
      motion_bucket_id: 127,
      fps: 6,
    },
    supportedModes: ['image2video'],
    stylePrefix: '',
    avgWaitTime: 60,
    available: false, // ⚠️ Not verified working — may need Gradio endpoint update
    speed: 3,
    quality: 4,
  },

  // ── REMOVED (tested, not working with our API) ──────────────────────
  // ❌ cogvideox-fun-5b → old Gradio, /gradio_api/call returns 404
  // ❌ wan21-t2v → accepts job but returns error on poll
  // ❌ wan21-i2v → same space as wan21-t2v, same issues
};

// ═══════════════════════════════════════════════════════════════════════
// VIDEO GENERATION
// ═══════════════════════════════════════════════════════════════════════

async function generateWithGradio(
  prompt: string,
  model: HFVideoModelEntry,
  options?: HFVideoGenerateOptions
): Promise<HFVideoResult> {
  console.log(`[HF-Video] Generating via: ${model.spaceName}`);

  // Quick pre-check
  try {
    const spaceUrl = `https://${model.spaceName.replace('/', '-')}.hf.space`;
    await withTimeout(
      fetch(spaceUrl, { method: 'HEAD' }),
      10_000,
      `Space ${model.spaceName} unreachable`
    );
  } catch (checkError) {
    const errMsg = checkError instanceof Error ? checkError.message : String(checkError);
    throw new Error(`Space ${model.spaceName} is not available: ${errMsg.slice(0, 100)}`);
  }

  const fullPrompt = model.stylePrefix + prompt;

  // Build the data array based on model
  let data: unknown[];

  if (model.id === 'cogvideox-2b') {
    // CogVideoX-2B: /generate(prompt, num_inference_steps, guidance_scale)
    data = [
      fullPrompt,
      options?.numInferenceSteps ?? model.defaultParams.num_inference_steps ?? 50,
      options?.guidanceScale ?? model.defaultParams.guidance_scale ?? 6.0,
    ];
  } else if (model.id === 'cogvideox-5b') {
    // CogVideoX-5B: /generate(prompt, image_input, video_input, video_strength, seed_value, scale_status, rife_status)
    data = [
      fullPrompt,
      options?.image_url || null,  // image_input
      null,                         // video_input
      0.5,                          // video_strength
      options?.seed ?? -1,          // seed_value
      false,                        // scale_status
      false,                        // rife_status
    ];
  } else if (model.id === 'ltx-video-distilled') {
    // LTX-Video Distilled T2V: /text_to_video(prompt, negative_prompt, input_image, input_video, height, width, mode, duration, frames, seed, randomize, guidance, improve_texture)
    data = [
      fullPrompt,
      options?.guidanceScale ? String(options.guidanceScale) : '',
      '',
      '',
      options?.height ?? 512,
      options?.width ?? 704,
      'text2video',
      options?.duration ?? 2,
      0,
      options?.seed ?? 42,
      options?.seed !== undefined ? false : true,
      options?.guidanceScale ?? 1,
      true,
    ];
  } else if (model.id === 'ltx-video-distilled-i2v') {
    // LTX-Video Distilled I2V: /image_to_video(prompt, negative_prompt, input_image, input_video, height, width, mode, duration, frames, seed, randomize, guidance, improve_texture)
    data = [
      fullPrompt,
      '',
      options?.image_url || null,  // input_image
      '',
      options?.height ?? 512,
      options?.width ?? 704,
      'image2video',
      options?.duration ?? 2,
      0,
      options?.seed ?? 42,
      options?.seed !== undefined ? false : true,
      options?.guidanceScale ?? 1,
      true,
    ];
  } else if (model.id === 'ltx-2-3') {
    // LTX-2-3: /generate_video(input_image, prompt, duration, enhance_prompt, seed, randomize_seed, height, width)
    data = [
      options?.image_url || null,    // input_image
      fullPrompt,                    // prompt
      options?.duration ?? 3.0,     // duration
      false,                         // enhance_prompt
      options?.seed ?? 10,          // seed
      options?.seed !== undefined ? false : true, // randomize_seed
      options?.height ?? 1024,      // height
      options?.width ?? 1536,       // width
    ];
  } else if (model.id === 'wan21-fast-i2v') {
    // Wan2.1 Fast: /generate_video(input_image, prompt, height, width, negative_prompt, duration_seconds, guidance_scale, steps, seed, randomize_seed)
    data = [
      options?.image_url || null,    // input_image
      fullPrompt,                    // prompt
      options?.height ?? 512,       // height
      options?.width ?? 896,        // width
      '',                            // negative_prompt
      options?.duration ?? 2,       // duration_seconds
      options?.guidanceScale ?? 1.0, // guidance_scale
      options?.numInferenceSteps ?? 4, // steps
      options?.seed ?? 42,          // seed
      options?.seed !== undefined ? false : true, // randomize_seed
    ];
  } else if (model.id === 'stable-video-diffusion') {
    // SVD: /video(image, seed, randomize_seed, motion_bucket_id, fps)
    data = [
      options?.image_url || null,   // image (required for SVD)
      options?.seed ?? 42,          // seed
      options?.seed !== undefined ? false : true, // randomize_seed
      model.defaultParams.motion_bucket_id,
      model.defaultParams.fps,
    ];
  } else {
    // Generic fallback
    data = [fullPrompt];
  }

  const endpoint = model.endpoint.replace(/^\//, '');
  const resultData = await gradioHttpCall(model.spaceName, endpoint, data, VIDEO_GENERATION_TIMEOUT_MS);

  // Extract video URL
  let videoUrl: string | null = null;
  for (const item of resultData) {
    try {
      videoUrl = extractVideoUrl(item, model.spaceName);
      break;
    } catch { /* continue */ }
  }

  if (!videoUrl) {
    throw new Error(`Could not extract video from ${model.spaceName}. Raw: ${JSON.stringify(resultData).slice(0, 300)}`);
  }

  return { videoUrl, model: model.id, durationMs: 0 };
}

export async function generateHFVideo(
  prompt: string,
  modelId: string,
  options?: HFVideoGenerateOptions
): Promise<HFVideoResult> {
  const model = HF_VIDEO_MODELS[modelId];
  if (!model) throw new Error(`Unknown video model: ${modelId}`);
  if (!model.available) throw new Error(`Model ${modelId} is unavailable`);

  const startTime = Date.now();

  console.log(`[HF-Video] Generating with ${modelId}: "${prompt.slice(0, 60)}..."`);

  if (options?.signal?.aborted) throw new Error('Request cancelled');

  try {
    // Note: generateWithGradio already applies model.stylePrefix internally,
    // so we pass the raw prompt here to avoid double-prefixing.
    const result = await generateWithGradio(prompt, model, options);

    const lb = getHFLoadBalancer();
    lb.recordSuccess(modelId, Date.now() - startTime);
    result.durationMs = Date.now() - startTime;
    console.log(`[HF-Video] ✓ Success: ${modelId} in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    if (options?.returnBase64) {
      try {
        result.base64 = await downloadVideoAsBase64(result.videoUrl);
      } catch (err) {
        console.warn(`[HF-Video] Could not download video as base64: ${err}`);
      }
    }

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const lb = getHFLoadBalancer();
    let errorType: 'generic' | 'rate_limit' | 'timeout' = 'generic';
    if (err.message.includes('429') || err.message.toLowerCase().includes('rate limit')) errorType = 'rate_limit';
    else if (err.message.includes('timeout') || err.message.includes('timed out') || err.message.includes('abort')) errorType = 'timeout';
    lb.recordError(modelId, err.message, errorType);
    console.error(`[HF-Video] Error with ${modelId}: ${err.message.slice(0, 150)}`);
    throw err;
  }
}

export async function generateVideoWithFallback(
  prompt: string,
  preferredModels?: string[],
  options?: HFVideoGenerateOptions
): Promise<HFVideoFallbackResult> {
  const lb = getHFLoadBalancer();
  const preferred = preferredModels?.length ? preferredModels : [
    'cogvideox-2b', 'ltx-video-distilled', 'cogvideox-5b', 'ltx-2-3',
  ];

  const attemptedModels: string[] = [];
  const excludeModels = new Set<string>();

  for (const modelId of preferred) {
    if (!HF_VIDEO_MODELS[modelId]) continue;
    if (!lb.isModelUsable(modelId)) { excludeModels.add(modelId); continue; }

    attemptedModels.push(modelId);
    try {
      const result = await generateHFVideo(prompt, modelId, options);
      return { ...result, attemptedModels, usedFallback: false };
    } catch {
      excludeModels.add(modelId);
    }
  }

  // Try remaining models
  const remaining = Object.keys(HF_VIDEO_MODELS).filter(
    (id) => !excludeModels.has(id) && HF_VIDEO_MODELS[id].available && lb.isModelUsable(id)
  );

  for (const modelId of remaining.slice(0, 3)) {
    attemptedModels.push(modelId);
    try {
      const result = await generateHFVideo(prompt, modelId, options);
      return { ...result, attemptedModels, usedFallback: true };
    } catch { /* continue */ }
  }

  throw new Error(`All video models failed after ${attemptedModels.length} attempts`);
}

// ═══════════════════════════════════════════════════════════════════════
// MODEL TESTING & AVAILABILITY
// ═══════════════════════════════════════════════════════════════════════

export async function testVideoModel(id: string): Promise<VideoModelTestResult> {
  const model = HF_VIDEO_MODELS[id];
  if (!model) return { available: false, responseTimeMs: 0, error: `Unknown model: ${id}` };

  const startTime = Date.now();

  try {
    const spaceUrl = `https://${model.spaceName.replace('/', '-')}.hf.space`;
    const response = await withTimeout(
      fetch(spaceUrl, { method: 'HEAD' }),
      MODEL_TEST_TIMEOUT_MS,
      `Test timed out`
    );
    const responseTimeMs = Date.now() - startTime;

    if (response.ok || [200, 302, 303, 401, 403].includes(response.status)) {
      return { available: true, responseTimeMs };
    }
    if ([404, 502, 503, 504].includes(response.status)) {
      return { available: true, responseTimeMs, error: `Space may be sleeping (${response.status})` };
    }
    return { available: false, responseTimeMs, error: `HTTP ${response.status}` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const responseTimeMs = Date.now() - startTime;
    return { available: true, responseTimeMs, error: `Space may be sleeping: ${errorMsg.slice(0, 80)}` };
  }
}

export async function refreshVideoModels(): Promise<Record<string, VideoModelTestResult>> {
  console.log('[HF-Video] Refreshing model availability...');
  const results: Record<string, VideoModelTestResult> = {};
  const modelIds = getAllVideoModelIds();

  const batchSize = 5;
  for (let i = 0; i < modelIds.length; i += batchSize) {
    const batch = modelIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (id) => ({ id, result: await testVideoModel(id) }))
    );
    for (const { id, result } of batchResults) {
      results[id] = result;
      HF_VIDEO_MODELS[id].available = result.available;
    }
  }

  const lb = getHFLoadBalancer();
  for (const [id, entry] of Object.entries(HF_VIDEO_MODELS)) {
    lb.registerModel(id, entry.supportedModes, entry.available);
  }

  const availableCount = Object.values(results).filter((r) => r.available).length;
  console.log(`[HF-Video] Refresh: ${availableCount}/${modelIds.length} available`);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

export function getAllVideoModelIds(): string[] {
  return Object.entries(HF_VIDEO_MODELS)
    .filter(([, m]) => m.available)
    .map(([id]) => id);
}

export function getVideoModelById(id: string): HFVideoModelEntry | undefined {
  return HF_VIDEO_MODELS[id];
}

export function getAvailableVideoModels(): HFVideoModelEntry[] {
  return Object.values(HF_VIDEO_MODELS).filter((m) => m.available);
}

// Register models with load balancer on first use
let modelsRegistered = false;
export function ensureVideoModelsRegistered(): void {
  if (modelsRegistered) return;
  const lb = getHFLoadBalancer();
  for (const [id, entry] of Object.entries(HF_VIDEO_MODELS)) {
    lb.registerModel(id, entry.supportedModes, entry.available);
  }
  modelsRegistered = true;
}
