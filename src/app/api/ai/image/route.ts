import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { traceImage, traceError, traceDB } from '@/lib/trace-logger';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  generateImage,
  getImageModelMapping,
  sanitizePrompt,
  isContentFilterError,
  detectImageFormat,
} from '@/lib/pollinations';
import {
  generateImage as generateHFImage,
  type HFImageModel,
} from '@/lib/huggingface';
import { getImageGenModelById } from '@/lib/image-models';
import { reportSuccess as reportAggregatorSuccess, reportFailure as reportAggregatorFailure } from '@/lib/api-aggregator/reporter';
import { resolveHFModelId, buildHFInferenceUrl } from '@/lib/hf-model-resolve';

// Set max duration for this API route
export const maxDuration = 420; // 7 minutes

// ═══════════════════════════════════════════════════════════════════
// PROVIDER ARCHITECTURE (SIMPLE — NO FALLBACKS)
// ═══════════════════════════════════════════════════════════════════
// Each model uses ONLY its own provider. No switching.
// If it fails → return error to user with the model name.
// ═══════════════════════════════════════════════════════════════════

// ZhipuAI / BigModel Platform API key
// Uses ZAI_API_KEY (preferred) with ZHIPU_PLATFORM_KEY as legacy fallback.
// The free cogview-3-flash model works with this key.
// FIX M5: Lazy key validation — check at call time, not module scope
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

/**
 * Generate image using ZhipuAI / BigModel Platform API directly.
 * Endpoint: POST /images/generations  with model=cogview-3-flash (FREE)
 */
async function generateWithZhipuAPI(
  prompt: string,
  size: string,
  model: string
): Promise<{ base64: string }> {
  // FIX M5: Validate API key at call time with clear error
  // Prefer ZAI_API_KEY (the canonical env var across the platform),
  // fall back to ZHIPU_PLATFORM_KEY for legacy deployments.
  const ZHIPU_PLATFORM_KEY = process.env.ZAI_API_KEY || process.env.ZHIPU_PLATFORM_KEY;
  if (!ZHIPU_PLATFORM_KEY) {
    throw new Error('ZhipuAI API key not configured (set ZAI_API_KEY env var)');
  }

  const url = `${ZHIPU_API_BASE}/images/generations`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_PLATFORM_KEY}`,
    },
    body: JSON.stringify({ model, prompt, size }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ZhipuAI API error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();

  const imageUrl = result.data?.[0]?.url;
  if (imageUrl) {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      throw new Error(`Failed to download image: ${imgResponse.status}`);
    }
    const arrayBuffer = await imgResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    return { base64 };
  }

  const base64 = result.data?.[0]?.base64 || result.data?.[0]?.b64_json;
  if (base64) {
    return { base64 };
  }

  throw new Error('No image data in ZhipuAI response');
}

/**
 * Generate image using HuggingFace Inference API.
 */
async function generateWithHuggingFace(
  prompt: string,
  model: string,
  width: number,
  height: number,
): Promise<{ base64: string }> {
  const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';
  if (!HF_API_TOKEN) {
    throw new Error('HuggingFace token not configured');
  }

  traceImage(`[HuggingFace] Generating with model=${model}, size=${width}x${height}`);

  const result = await generateHFImage({
    prompt,
    model: model as HFImageModel | undefined,
    width: Math.min(width, 1024),
    height: Math.min(height, 1024),
  });

  return { base64: result.base64 };
}


/**
 * Generate image using Z-AI Web Dev SDK.
 * This is the most reliable free provider.
 * Uses the singleton getZAIClient() to avoid per-request client creation.
 */
async function generateWithZAISDK(
  prompt: string,
  size: string,
): Promise<{ base64: string }> {
  const { getZAIClient } = await import('@/lib/chat-utils');
  const zai = await getZAIClient();

  // Parse size to get width/height
  const [w, h] = size.split('x').map(Number);
  const validSize = `${Math.min(w || 1024, 1024)}x${Math.min(h || 1024, 1024)}`;

  const response = await zai.images.generations.create({
    prompt,
    size: validSize as any,
  });

  if (response.data?.[0]?.base64) {
    return { base64: response.data[0].base64 };
  }

  if (response.data?.[0]?.url) {
    // Download image from URL
    const imgResponse = await fetch(response.data[0].url);
    if (!imgResponse.ok) throw new Error(`Failed to download image: ${imgResponse.status}`);
    const arrayBuffer = await imgResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return { base64: buffer.toString('base64') };
  }

  throw new Error('No image data in Z-AI SDK response');
}

/**
 * Parse a size string like "1024x1024" into width and height numbers.
 */
function parseSize(size: string): { width: number; height: number } {
  const parts = size.split('x');
  const width = parseInt(parts[0], 10) || 1024;
  const height = parseInt(parts[1], 10) || 1024;
  return { width, height };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN POST HANDLER — NO FALLBACKS, DIRECT MODEL ROUTING
// ═══════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    // Rate limiting
    const rateLimitResponse = checkRateLimit(
      request,
      user ? RATE_LIMIT_PRESETS.ai : { ...RATE_LIMIT_PRESETS.ai, maxRequests: 3 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    let body: { prompt?: string; model?: string; size?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
    }

    const { prompt, model, size } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'يرجى إدخال وصف الصورة' }, { status: 400 });
    }

    const validSizes = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440', '1024x1792', '1792x1024'];
    const imageSize = validSizes.includes(size ?? '') ? size! : '1024x1024';
    const { width, height } = parseSize(imageSize);

    // ─── Apply Prompt Engineering ───
    const { optimizePrompt, detectImageModelFamily } = await import('@/lib/prompt-engine');

    const imageModelConfig = getImageGenModelById(model ?? '');

    // ── Custom Image Model Bridge (from Aggregator) ──
    let isCustomImageModel = false;
    let customImageModel: any = null;
    if (!imageModelConfig && model?.startsWith('custom:image:')) {
      const customModelId = model.split(':').slice(2).join(':');
      try {
        const cm = await db.customModel.findUnique({ where: { id: customModelId } });
        if (cm && cm.isActive && cm.category === 'image') {
          // Resolve short HF model IDs to full paths
          if (cm.modelId) {
            const resolvedId = resolveHFModelId(cm.modelId);
            if (resolvedId && resolvedId !== cm.modelId) {
              cm.modelId = resolvedId;
            }
          }
          customImageModel = cm;
          isCustomImageModel = true;
        }
      } catch (err) {
        console.warn('[Image] Failed to load custom model:', err);
      }
    }

    let imageBase64: string | null = null;
    let usedModel = '';
    let usedPrompt = '';
    let provider: string = 'unknown';
    let realModel = '';
    let modelLabel = model || 'default';
    let lastError: string = '';
    const imageStartTime = Date.now();

    if (isCustomImageModel && customImageModel) {
      // ═══════════════════════════════════════════════════════════════
      // CUSTOM MODEL: Route to the aggregator endpoint directly
      // ═══════════════════════════════════════════════════════════════
      modelLabel = customImageModel.nameEn || customImageModel.name;
      provider = 'custom';
      const engineOptimized = optimizePrompt(prompt.trim(), {
        category: 'image' as const,
        modelFamily: detectImageModelFamily(customImageModel.modelId || ''),
        isArabic: true,
      });

      try {
        const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (customImageModel.apiKey) {
          if (customImageModel.authType === 'bearer') customHeaders['Authorization'] = `Bearer ${customImageModel.apiKey}`;
          else if (customImageModel.authType === 'x-api-key') customHeaders[customImageModel.authHeader || 'x-api-key'] = customImageModel.apiKey;
          else if (customImageModel.authType === 'custom' && customImageModel.authHeader) customHeaders[customImageModel.authHeader] = customImageModel.apiKey;
        }

        // Use Pollinations-style URL format if apiFormat is "pollinations"
        if (customImageModel.apiFormat === 'pollinations') {
          const imageUrl = `${customImageModel.baseUrl}/${encodeURIComponent(engineOptimized)}?model=${customImageModel.modelId || 'flux'}&width=${width}&height=${height}&nologo=true`;
          // Build headers for pollinations (include auth if apiKey is set)
          const pollinationsHeaders: Record<string, string> = {};
          if (customImageModel.apiKey) {
            if (customImageModel.authType === 'bearer') pollinationsHeaders['Authorization'] = `Bearer ${customImageModel.apiKey}`;
            else if (customImageModel.authType === 'x-api-key') pollinationsHeaders[customImageModel.authHeader || 'x-api-key'] = customImageModel.apiKey;
            else if (customImageModel.authType === 'custom' && customImageModel.authHeader) pollinationsHeaders[customImageModel.authHeader] = customImageModel.apiKey;
          }
          const imgResponse = await fetch(imageUrl, {
            headers: pollinationsHeaders,
            signal: AbortSignal.timeout(60_000),
          });
          if (!imgResponse.ok) {
            const errText = await imgResponse.text().catch(() => '');
            throw new Error(`فشل تحميل النموذج: '${customImageModel.nameEn || customImageModel.name}' نقطة النهاية المخصصة أرجعت ${imgResponse.status}${errText ? ': ' + errText.slice(0, 150) : ''}`);
          }
          const arrayBuffer = await imgResponse.arrayBuffer();
          imageBase64 = Buffer.from(arrayBuffer).toString('base64');
          usedModel = customImageModel.modelId || customImageModel.nameEn;
          usedPrompt = engineOptimized;
          realModel = usedModel;
        } else if (customImageModel.apiFormat === 'hf-inference') {
          // HuggingFace Inference API — sends prompt as JSON, receives binary image
          const hfHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (customImageModel.apiKey) {
            if (customImageModel.authType === 'bearer') hfHeaders['Authorization'] = `Bearer ${customImageModel.apiKey}`;
            else if (customImageModel.authType === 'x-api-key') hfHeaders[customImageModel.authHeader || 'x-api-key'] = customImageModel.apiKey;
            else if (customImageModel.authType === 'custom' && customImageModel.authHeader) hfHeaders[customImageModel.authHeader] = customImageModel.apiKey;
          }

          // Construct correct HF Inference URL — resolves short model IDs to full paths
          const hfUrl = buildHFInferenceUrl(customImageModel.baseUrl, customImageModel.modelId);
          const resolvedModelId = resolveHFModelId(customImageModel.modelId) || customImageModel.modelId || customImageModel.nameEn;

          const hfResponse = await fetch(hfUrl, {
            method: 'POST',
            headers: hfHeaders,
            body: JSON.stringify({ inputs: engineOptimized, parameters: { width, height } }),
            signal: AbortSignal.timeout(120_000),
          });
          if (!hfResponse.ok) {
            const errText = await hfResponse.text().catch(() => '');
            throw new Error(`فشل تحميل نموذج الاستدلال: '${resolvedModelId}' أرجع ${hfResponse.status}: ${errText.slice(0, 200)}`);
          }
          const contentType = hfResponse.headers.get('content-type') || '';
          if (contentType.includes('image')) {
            // Binary image response
            const arrayBuffer = await hfResponse.arrayBuffer();
            imageBase64 = Buffer.from(arrayBuffer).toString('base64');
          } else {
            // JSON response (might contain base64 or URL)
            const data = await hfResponse.json();
            if (data.data?.[0]?.b64_json) {
              imageBase64 = data.data[0].b64_json;
            } else if (data.data?.[0]?.url) {
              const imgRes = await fetch(data.data[0].url);
              const arrBuf = await imgRes.arrayBuffer();
              imageBase64 = Buffer.from(arrBuf).toString('base64');
            } else if (data.images?.[0]) {
              imageBase64 = data.images[0];
            } else if (typeof data === 'string') {
              imageBase64 = data;
            }
          }
          usedModel = resolvedModelId;
          usedPrompt = engineOptimized;
          realModel = usedModel;
        } else {
          // OpenAI-compatible format
          const response = await fetch(customImageModel.baseUrl, {
            method: 'POST',
            headers: customHeaders,
            body: JSON.stringify({
              model: customImageModel.modelId || 'default',
              prompt: engineOptimized,
              width,
              height,
              n: 1,
            }),
            signal: AbortSignal.timeout(120_000),
          });
          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Custom endpoint returned ${response.status}: ${errText.slice(0, 200)}`);
          }
          const data = await response.json();
          // Handle different response formats
          if (data.data?.[0]?.b64_json) {
            imageBase64 = data.data[0].b64_json;
          } else if (data.data?.[0]?.url) {
            // Download from URL and convert to base64
            const imgRes = await fetch(data.data[0].url);
            const arrBuf = await imgRes.arrayBuffer();
            imageBase64 = Buffer.from(arrBuf).toString('base64');
          } else if (data.images?.[0]) {
            imageBase64 = data.images[0];
          }
          usedModel = customImageModel.modelId || customImageModel.nameEn;
          usedPrompt = engineOptimized;
          realModel = usedModel;
        }

        reportAggregatorSuccess('custom', 'image', Date.now() - imageStartTime);
      } catch (customErr) {
        reportAggregatorFailure('custom', 'image', customErr instanceof Error ? customErr.message : String(customErr));
        lastError = customErr instanceof Error ? customErr.message : String(customErr);
        traceImage(`[Custom] فشل: ${lastError}`);
      }
    } else if (imageModelConfig) {
      // ═══════════════════════════════════════════════════════════════
      // NEW-STYLE: Route to the EXACT model the user selected
      // No fallbacks — if it fails, tell the user
      // ═══════════════════════════════════════════════════════════════
      modelLabel = imageModelConfig.nameEn || imageModelConfig.name;
      const stylePrefix = imageModelConfig.stylePrefix || '';
      const modelFamily = detectImageModelFamily(imageModelConfig.backendModel);
      const engineOptimized = optimizePrompt(prompt.trim(), {
        category: 'image' as const,
        modelFamily,
        isArabic: true,
      });
      const enhancedPrompt = `${stylePrefix}${engineOptimized}`;

      traceImage(`توليد صورة: ${prompt.slice(0, 50)} (${imageSize}) [id: ${model}, provider: ${imageModelConfig.provider}]`);

      // Try with enhanced prompt first, then raw prompt as backup
      const promptsToTry = [enhancedPrompt, prompt.trim()];

      if (imageModelConfig.provider === 'pollinations') {
        provider = 'pollinations';
        const pollinationsModel = imageModelConfig.backendModel;

        for (const tryPrompt of promptsToTry) {
          try {
            traceImage(`[Pollinations] محاولة: model=${pollinationsModel}, prompt=${tryPrompt.slice(0, 60)}...`);
            const result = await generateImage({
              prompt: tryPrompt,
              model: pollinationsModel as any,
              width,
              height,
              nologo: true,
            });
            imageBase64 = result.base64;
            usedModel = pollinationsModel;
            usedPrompt = tryPrompt;
            realModel = result.model || pollinationsModel;
            traceImage(`[Pollinations] نجاح! model=${pollinationsModel}`);
            reportAggregatorSuccess('pollinations', 'image', Date.now() - imageStartTime);
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (isContentFilterError(err)) {
              lastError = 'المحتوى محجوب بفلتر الأمان';
            }
            traceError(`[Pollinations] خطأ: ${lastError.slice(0, 100)}`);
            reportAggregatorFailure('pollinations', 'image', lastError);
            continue;
          }
        }

        // NO FALLBACK — if Pollinations fails, return error to user
        // User explicitly chose this model, don't silently switch to another provider

      } else if (imageModelConfig.provider === 'huggingface') {
        provider = 'huggingface';
        const hfModel = imageModelConfig.backendModel;

        for (const tryPrompt of promptsToTry) {
          try {
            traceImage(`[HuggingFace] محاولة: model=${hfModel}, prompt=${tryPrompt.slice(0, 60)}...`);
            const result = await generateWithHuggingFace(tryPrompt, hfModel, width, height);
            imageBase64 = result.base64;
            usedModel = hfModel;
            usedPrompt = tryPrompt;
            realModel = imageModelConfig.nameEn;
            traceImage(`[HuggingFace] نجاح! model=${hfModel}`);
            reportAggregatorSuccess('huggingface', 'image', Date.now() - imageStartTime);
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (isContentFilterError(err)) {
              lastError = 'المحتوى محجوب بفلتر الأمان';
            }
            traceError(`[HuggingFace] خطأ: ${lastError.slice(0, 100)}`);
            reportAggregatorFailure('huggingface', 'image', lastError);
            continue;
          }
        }

      } else if (imageModelConfig.provider === 'zhipuai') {
        provider = 'zhipuai';
        const zhipuModel = imageModelConfig.backendModel;

        for (const tryPrompt of promptsToTry) {
          try {
            traceImage(`[ZhipuAI] محاولة: model=${zhipuModel}, prompt=${tryPrompt.slice(0, 60)}...`);
            const result = await generateWithZhipuAPI(tryPrompt, imageSize, zhipuModel);
            imageBase64 = result.base64;
            usedModel = zhipuModel;
            usedPrompt = tryPrompt;
            realModel = zhipuModel;
            traceImage(`[ZhipuAI] نجاح! model=${zhipuModel}`);
            reportAggregatorSuccess('zhipuai', 'image', Date.now() - imageStartTime);
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (isContentFilterError(err)) {
              lastError = 'المحتوى محجوب بفلتر الأمان';
            }
            traceError(`[ZhipuAI] خطأ: ${lastError.slice(0, 100)}`);
            reportAggregatorFailure('zhipuai', 'image', lastError);
            continue;
          }
        }

      } else if (imageModelConfig.provider === 'zai') {
        provider = 'zai';
        for (const tryPrompt of promptsToTry) {
          try {
            traceImage(`[Z-AI SDK] محاولة: prompt=${tryPrompt.slice(0, 60)}...`);
            const result = await generateWithZAISDK(tryPrompt, imageSize);
            imageBase64 = result.base64;
            usedModel = 'z-ai-sdk';
            usedPrompt = tryPrompt;
            realModel = imageModelConfig.nameEn;
            traceImage(`[Z-AI SDK] نجاح!`);
            reportAggregatorSuccess('zai', 'image', Date.now() - imageStartTime);
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            traceError(`[Z-AI SDK] خطأ: ${lastError.slice(0, 100)}`);
            reportAggregatorFailure('zai', 'image', lastError);
            continue;
          }
        }
      }

    } else {
      // ═══════════════════════════════════════════════════════════════
      // LEGACY MODEL ID ROUTING (chat model IDs like 'delta-artist')
      // Still no fallbacks — use the mapped model only
      // ═══════════════════════════════════════════════════════════════
      const mapping = getImageModelMapping(model ?? undefined);
      const pollinationsModel = mapping.pollinationsModel;
      const stylePrefix = mapping.stylePrefix;

      const modelFamily = detectImageModelFamily(pollinationsModel);
      const engineOptimized = optimizePrompt(prompt.trim(), {
        category: 'image' as const,
        modelFamily,
        isArabic: true,
      });
      const enhancedPrompt = `${stylePrefix}${engineOptimized}`;

      modelLabel = mapping.label || model || 'default';
      provider = 'pollinations';
      traceImage(`توليد صورة [legacy]: ${prompt.slice(0, 50)} (${imageSize}) [frontend: ${modelLabel}, pollinations: ${pollinationsModel}]`);

      const promptsToTry = [enhancedPrompt, prompt.trim()];

      for (const tryPrompt of promptsToTry) {
        try {
          const result = await generateImage({
            prompt: tryPrompt,
            model: pollinationsModel as any,
            width,
            height,
            nologo: true,
          });
          imageBase64 = result.base64;
          usedModel = pollinationsModel;
          usedPrompt = tryPrompt;
          realModel = result.model || pollinationsModel;
          reportAggregatorSuccess('pollinations', 'image', Date.now() - imageStartTime);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (isContentFilterError(err)) {
            lastError = 'المحتوى محجوب بفلتر الأمان';
          }
          traceError(`[Legacy Pollinations] خطأ: ${lastError.slice(0, 100)}`);
          reportAggregatorFailure('pollinations', 'image', lastError);
          continue;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // IF FAILED — return clear error with model name
    // ═══════════════════════════════════════════════════════════════
    if (!imageBase64) {
      const modelName = modelLabel || model || 'غير معروف';
      const errorMsg = lastError
        ? `فشل توليد الصورة بالنموذج "${modelName}". السبب: ${lastError.slice(0, 150)}`
        : `فشل توليد الصورة بالنموذج "${modelName}". جرب موديل تاني أو حاول مرة أخرى.`;

      traceError(errorMsg);
      return NextResponse.json(
        { error: errorMsg, failedModel: modelName, provider },
        { status: 500 }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // VALIDATE & SAVE: Validate image data and save to disk
    // FIX M4: Combine validation and save to avoid creating the buffer twice.
    // Previously: validationBuffer + save buffer = 2 copies of the same data.
    // Now: validate while saving = 1 buffer only.
    // ═══════════════════════════════════════════════════════════════
    const { ext, mimeType } = detectImageFormat(imageBase64);
    const buffer = Buffer.from(imageBase64, 'base64');

    // Validate the image data
    const isValidImage = (
      (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) || // JPEG
      (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) || // PNG
      (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) || // GIF
      (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) // WebP
    );

    if (!isValidImage || buffer.length < 100) {
      traceError(`بيانات الصورة غير صالحة: الحجم=${buffer.length} bytes, أول بايتات=${buffer.slice(0, 4).toString('hex')}`);
      return NextResponse.json(
        { error: `النموذج "${modelLabel}" رجّع بيانات صورة غير صالحة. جرب موديل تاني.` },
        { status: 500 }
      );
    }

    // Save to disk
    const downloadDir = path.join(process.cwd(), 'download');
    await mkdir(downloadDir, { recursive: true });

    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const filename = `${imageId}.${ext}`;
    const absoluteFilePath = path.join(downloadDir, filename);
    await writeFile(absoluteFilePath, buffer);

    const fileSize = buffer.length;

    const stylePrefixForMeta = imageModelConfig
      ? (imageModelConfig.stylePrefix || '').trim()
      : (getImageModelMapping(model ?? undefined).stylePrefix || '').trim();

    traceDB('حفظ أصل الصورة في قاعدة البيانات');
    const asset = await db.generativeAsset.create({
      data: {
        type: 'image',
        title: prompt.slice(0, 100),
        prompt: prompt,
        filePath: absoluteFilePath,
        fileSize,
        model: model || usedModel,
        metadata: JSON.stringify({
          size: imageSize,
          format: ext,
          mimeType,
          originalPrompt: prompt,
          enhancedPrompt: usedPrompt,
          modelUsed: modelLabel,
          backendModel: usedModel,
          realModel,
          provider,
          stylePrefix: stylePrefixForMeta,
        }),
        userId: user.id,
      },
    });

    traceImage(`تم توليد الصورة بنجاح: ${filename} (${(fileSize / 1024).toFixed(1)}KB) [${provider}: ${modelLabel} → ${realModel}]`);

    // FIX M4: Don't return the full base64 data URL inline in the response.
    // Previously: returned `data:image/png;base64,${imageBase64}` which duplicates
    // the same data already saved to disk. For a 1024x1024 image, that's ~3MB
    // of base64 text in the JSON response on top of the file on disk.
    // Frontend should fetch the image via the URL on demand.
    // Keep a small thumbnail (128x128) for preview if needed.
    return NextResponse.json({
      success: true,
      imageUrl: `/api/ai/image/download/${asset.id}`,
      assetId: asset.id,
      size: fileSize,
      model: modelLabel,
      backendModel: usedModel,
      realModel,
      provider,
      // Include only a flag that the image is ready, not the full base64
      // Frontend can fetch via imageUrl if it needs the image data
      hasImage: true,
    });
  } catch (error) {
    traceError(`خطأ عام في توليد الصورة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء توليد الصورة. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
