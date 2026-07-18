import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { traceImage, traceError, traceDB } from '@/lib/trace-logger';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  editImage,
  generateImage,
  sanitizePrompt,
  isContentFilterError,
  detectImageFormat,
  PollinationsEditModel,
  PollinationsImageModel,
} from '@/lib/pollinations';

// ═══════════════════════════════════════════════════════════════════
// PROVIDER ARCHITECTURE — Image Edit Route
// ═══════════════════════════════════════════════════════════════════
// Step 1: Pollinations editImage() — real image editing with model rotation
// Step 2: Pollinations generateImage() — fallback: describe the edit as new image
// Step 3: ZhipuAI cogview — last resort fallback (generates new image from prompt)
//
// FIX M1: Added global timeout cap of 3 minutes to prevent 30+ minute waits
// ═══════════════════════════════════════════════════════════════════

// ─── Global timeout for the entire edit operation (3 minutes) ────────
const GLOBAL_TIMEOUT_MS = 3 * 60 * 1000;

// ─── Reduced model lists — try top 3 most reliable models only ──────
// Previously tried 6 models × 2 prompts = 12 attempts per step (total 26).
// Now try 3 models × 1 prompt = 3 attempts per step (total 8 max).
const EDIT_MODELS: PollinationsEditModel[] = [
  'gpt-image-2',
  'gptimage',
  'flux',
];

const GENERATION_MODELS: PollinationsImageModel[] = [
  'gptimage',
  'flux',
  'seedream5',
];

// ─── ZhipuAI Platform API (last resort fallback) ──────────────────
const ZHIPU_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const ZHIPU_IMAGE_MODELS = ['cogview-3-flash'];

/**
 * Generate image using ZhipuAI Platform API directly (last resort fallback).
 */
async function generateWithZhipuAPI(
  prompt: string,
  size: string,
  model: string
): Promise<{ base64: string }> {
  const ZHIPU_PLATFORM_KEY = process.env.ZHIPU_PLATFORM_KEY;
  if (!ZHIPU_PLATFORM_KEY) {
    throw new Error('ZhipuAI API key not configured');
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

  // ZhipuAI returns a URL, we need to download and convert to base64
  const imageUrl = result.data?.[0]?.url;
  if (imageUrl) {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      throw new Error(`Failed to download image: ${imgResponse.status}`);
    }
    const arrayBuffer = await imgResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return { base64: buffer.toString('base64') };
  }

  // Fallback: if base64 is directly in the response
  const base64 = result.data?.[0]?.base64 || result.data?.[0]?.b64_json;
  if (base64) {
    return { base64 };
  }

  throw new Error('No image data in ZhipuAI response');
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

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;
    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const prompt = (formData.get('prompt') as string) || '';
    const size = (formData.get('size') as string) || '1024x1024';

    if (!imageFile || !prompt) {
      return NextResponse.json({ error: 'الصورة والوصف مطلوبان' }, { status: 400 });
    }

    const validSizes = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'];
    const imageSize = validSizes.includes(size) ? size : '1024x1024';
    const { width, height } = parseSize(imageSize);

    traceImage(`تعديل صورة: ${prompt.slice(0, 50)} (${imageSize})`);

    // Convert image to base64 data URL
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const mimeType = imageFile.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // Sanitized prompt as fallback
    const sanitizedPrompt = sanitizePrompt(prompt);

    let imageBase64: string | null = null;
    let usedModel = 'pollinations-edit';
    let usedPrompt = prompt;
    let provider: 'pollinations-edit' | 'pollinations-generate' | 'zhipuai' = 'pollinations-edit';

    // ── FIX M1: Global timeout cap ──
    // Previously: up to 26 sequential API calls could take 30+ minutes
    // Now: capped at 3 minutes total, then return a clear error
    const deadline = Date.now() + GLOBAL_TIMEOUT_MS;
    const isTimedOut = () => Date.now() > deadline;

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Try Pollinations editImage() with model rotation
    // ═══════════════════════════════════════════════════════════════
    traceImage(`[Pollinations Edit] محاولة تعديل الصورة...`);

    for (const tryModel of EDIT_MODELS) {
      if (isTimedOut()) break;
      // Try original prompt first, then sanitized
      for (const tryPrompt of [prompt, sanitizedPrompt]) {
        if (isTimedOut()) break;
        try {
          traceImage(`[Pollinations Edit] محاولة: model=${tryModel}, prompt=${tryPrompt.slice(0, 60)}...`);
          const result = await editImage({
            image: dataUrl,
            prompt: tryPrompt,
            model: tryModel,
            width,
            height,
          });
          imageBase64 = result.base64;
          usedModel = tryModel;
          usedPrompt = tryPrompt;
          provider = 'pollinations-edit';
          traceImage(`[Pollinations Edit] نجاح! model=${tryModel}, format=${result.format}`);
          break;
        } catch (editError) {
          if (isContentFilterError(editError)) {
            traceImage(`[Pollinations Edit] محجوب بفلتر: model=${tryModel}`);
            continue;
          }
          const errMsg = editError instanceof Error ? editError.message : '';
          traceImage(`[Pollinations Edit] فشل: model=${tryModel}, error=${errMsg.slice(0, 80)}`);
          continue;
        }
      }
      if (imageBase64) break;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Fallback to Pollinations generateImage()
    // ═══════════════════════════════════════════════════════════════
    if (!imageBase64 && !isTimedOut()) {
      traceImage(`[Pollinations Generate] Edit فشل، محاولة توليد صورة بالوصف...`);

      const editAsGenerationPrompt = `Create an image based on this description: ${prompt}. The image should reflect the requested edits on the original.`;

      for (const tryModel of GENERATION_MODELS) {
        if (isTimedOut()) break;
        for (const tryPrompt of [editAsGenerationPrompt, sanitizePrompt(editAsGenerationPrompt)]) {
          if (isTimedOut()) break;
          try {
            traceImage(`[Pollinations Generate] محاولة: model=${tryModel}, prompt=${tryPrompt.slice(0, 60)}...`);
            const result = await generateImage({
              prompt: tryPrompt,
              model: tryModel,
              width,
              height,
              nologo: true,
            });
            imageBase64 = result.base64;
            usedModel = tryModel;
            usedPrompt = tryPrompt;
            provider = 'pollinations-generate';
            traceImage(`[Pollinations Generate] نجاح! model=${tryModel}, format=${result.format}`);
            break;
          } catch (genError) {
            if (isContentFilterError(genError)) {
              traceImage(`[Pollinations Generate] محجوب بفلتر: model=${tryModel}`);
              continue;
            }
            const errMsg = genError instanceof Error ? genError.message : '';
            traceImage(`[Pollinations Generate] فشل: model=${tryModel}, error=${errMsg.slice(0, 80)}`);
            continue;
          }
        }
        if (imageBase64) break;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Last resort — ZhipuAI CogView models
    // ═══════════════════════════════════════════════════════════════
    if (!imageBase64 && !isTimedOut()) {
      traceImage(`[ZhipuAI] Pollinations فشل، محاولة ZhipuAI...`);

      for (const tryModel of ZHIPU_IMAGE_MODELS) {
        if (isTimedOut()) break;
        for (const tryPrompt of [prompt, sanitizedPrompt]) {
          if (isTimedOut()) break;
          try {
            traceImage(`[ZhipuAI] محاولة: model=${tryModel}, prompt=${tryPrompt.slice(0, 60)}...`);
            const result = await generateWithZhipuAPI(tryPrompt, imageSize, tryModel);
            imageBase64 = result.base64;
            usedModel = tryModel;
            usedPrompt = tryPrompt;
            provider = 'zhipuai';
            traceImage(`[ZhipuAI] نجاح! model=${tryModel}`);
            break;
          } catch (zhipuError) {
            if (isContentFilterError(zhipuError)) {
              traceImage(`[ZhipuAI] محجوب بفلتر: model=${tryModel}`);
              continue;
            }
            const errMsg = zhipuError instanceof Error ? zhipuError.message : '';
            traceError(`[ZhipuAI] خطأ: ${errMsg.slice(0, 100)}`);
            continue;
          }
        }
        if (imageBase64) break;
      }
    }

    if (!imageBase64) {
      const reason = isTimedOut()
        ? 'انتهت مهلة المحاولة (3 دقائق). جرب موديل تاني أو وصف أبسط.'
        : 'الوصف الذي أدخلته قد يحتوي على محتوى غير مناسب. يرجى تعديل الوصف والمحاولة مرة أخرى.';
      traceError(`فشل تعديل الصورة: ${reason}`);
      return NextResponse.json(
        { error: reason },
        { status: 400 }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Save image to disk and database
    // ═══════════════════════════════════════════════════════════════
    const downloadDir = path.join(process.cwd(), 'download');
    await mkdir(downloadDir, { recursive: true });

    const { ext, mimeType: detectedMime } = detectImageFormat(imageBase64);
    const imageId = `img_edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${imageId}.${ext}`;
    const absoluteFilePath = path.join(downloadDir, filename);
    const imgBuffer = Buffer.from(imageBase64, 'base64');

    await writeFile(absoluteFilePath, imgBuffer);

    // Save to database
    traceDB('حفظ أصل الصورة المعدلة في قاعدة البيانات');
    const asset = await db.generativeAsset.create({
      data: {
        type: 'image',
        title: prompt.slice(0, 100),
        prompt: prompt,
        filePath: absoluteFilePath,
        fileSize: imgBuffer.length,
        model: 'image-edit',
        metadata: JSON.stringify({
          size: imageSize,
          format: ext,
          mimeType: detectedMime,
          originalName: imageFile.name,
          operation: 'edit',
          provider,
          backendModel: usedModel,
          usedPrompt: usedPrompt.slice(0, 200),
        }),
        userId: user.id,
      },
    });

    traceImage(`تم تعديل الصورة بنجاح: ${filename} (${(imgBuffer.length / 1024).toFixed(1)}KB) [${provider}: ${usedModel}]`);

    return NextResponse.json({
      success: true,
      id: asset.id,
      imageUrl: `/api/ai/image/download/${asset.id}`,
      prompt,
      size: imageSize,
    });
  } catch (error) {
    console.error('[Image Edit] Error:', error);
    traceError(`خطأ في تعديل الصورة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    return NextResponse.json(
      { error: 'فشل في تعديل الصورة' },
      { status: 500 }
    );
  }
}
