// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Image Generation API
// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/hf/image
// Generates images using HuggingFace models (12 models available).
// Supports automatic fallback when the primary model fails.
//
// Auth is required — same pattern as the existing /api/ai/image route.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  generateHFImage,
  generateImageWithFallback,
  getImageModelById,
  HF_IMAGE_MODELS,
  type HFImageGenOptions,
} from '@/lib/hf-image.service';
import { isModelDisabled } from '@/lib/disabled-models';

// Set max duration for this API route (image generation can take up to 60s)
export const maxDuration = 60;

/** Request body schema */
interface ImageRequestBody {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  fallbackModels?: string[];
}

export async function POST(request: NextRequest) {
  try {
    // ─── Auth Required ────────────────────────────────────────────
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // ─── Parse Request Body ───────────────────────────────────────
    let body: ImageRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'طلب غير صالح. يرجى التحقق من تنسيق البيانات.' },
        { status: 400 }
      );
    }

    const { prompt, model, width, height, fallbackModels } = body;

    // ─── Validate Prompt ──────────────────────────────────────────
    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'يرجى إدخال وصف الصورة' },
        { status: 400 }
      );
    }

    // ─── Validate Model ───────────────────────────────────────────
    const resolvedModel = model || 'flux-schnell'; // Default to fastest model
    const modelEntry = getImageModelById(resolvedModel);

    if (!modelEntry) {
      const availableModels = Object.entries(HF_IMAGE_MODELS)
        .filter(([, m]) => m.available)
        .map(([id]) => id)
        .join(', ');
      return NextResponse.json(
        { error: `النموذج "${resolvedModel}" غير موجود. النماذج المتاحة: ${availableModels}` },
        { status: 400 }
      );
    }

    // Check if model is disabled by admin
    if (await isModelDisabled(resolvedModel)) {
      return NextResponse.json(
        { error: `النموذج "${resolvedModel}" معطل من قبل الآدمن` },
        { status: 403 }
      );
    }

    // Check if model is marked as unavailable
    if (!modelEntry.available) {
      return NextResponse.json(
        { error: `النموذج "${resolvedModel}" غير متاح حالياً` },
        { status: 503 }
      );
    }

    // ─── Validate Dimensions ──────────────────────────────────────
    const resolvedWidth = Math.min(Math.max(width || 1024, 256), 2048);
    const resolvedHeight = Math.min(Math.max(height || 1024, 256), 2048);

    // ─── Build Generation Options ─────────────────────────────────
    const genOptions: HFImageGenOptions = {
      width: resolvedWidth,
      height: resolvedHeight,
      timeoutMs: 120_000,  // 2 minutes
      maxRetries: 3,
    };

    // ─── Validate Fallback Models ─────────────────────────────────
    let validFallbacks: string[] | undefined;
    if (fallbackModels && Array.isArray(fallbackModels) && fallbackModels.length > 0) {
      validFallbacks = fallbackModels.filter((id) => getImageModelById(id) !== undefined);
      if (validFallbacks.length === 0) {
        validFallbacks = undefined;
      }
    }

    // ─── Generate Image ───────────────────────────────────────────
    const startTime = Date.now();
    let base64: string;
    let format: 'jpg' | 'png' | 'webp';
    let mimeType: string;
    let modelUsed: string;
    let wasFallback = false;
    let attempts = 1;

    if (validFallbacks && validFallbacks.length > 0) {
      // Use fallback generation
      const allModels = [resolvedModel, ...validFallbacks];
      try {
        const result = await generateImageWithFallback(prompt, allModels, genOptions);
        base64 = result.base64;
        format = result.format;
        mimeType = result.mimeType;
        modelUsed = result.usedModel;
        wasFallback = result.fellBack;
        attempts = allModels.indexOf(result.usedModel) + 1;
      } catch (fallbackError) {
        console.error('[HF-Image] All fallback models failed:', fallbackError);
        return NextResponse.json(
          {
            error: 'فشل توليد الصورة من جميع النماذج المتاحة. يرجى المحاولة مرة أخرى.',
            detail: fallbackError instanceof Error ? fallbackError.message : 'خطأ غير معروف',
          },
          { status: 500 }
        );
      }
    } else {
      // Single model generation (no explicit fallback list, but service handles cold starts)
      try {
        const result = await generateHFImage(prompt, resolvedModel, genOptions);
        base64 = result.base64;
        format = result.format;
        mimeType = result.mimeType;
        modelUsed = result.model;
      } catch (genError) {
        console.error('[HF-Image] Generation failed:', genError);

        // Try automatic fallback with default model order
        try {
          const fallbackResult = await generateImageWithFallback(prompt, undefined, genOptions);
          base64 = fallbackResult.base64;
          format = fallbackResult.format;
          mimeType = fallbackResult.mimeType;
          modelUsed = fallbackResult.usedModel;
          wasFallback = true;
          attempts = 2;
        } catch (finalError) {
          console.error('[HF-Image] Final fallback failed:', finalError);
          return NextResponse.json(
            {
              error: 'فشل توليد الصورة. يرجى المحاولة مرة أخرى لاحقاً.',
              detail: finalError instanceof Error ? finalError.message : 'خطأ غير معروف',
            },
            { status: 500 }
          );
        }
      }
    }

    const responseTimeMs = Date.now() - startTime;

    // ─── Save to Database ─────────────────────────────────────────
    try {
      await db.generativeAsset.create({
        data: {
          type: 'image',
          title: prompt.slice(0, 100),
          prompt: prompt,
          filePath: `hf-image:${modelUsed}:${Date.now()}`,
          fileSize: Math.round((base64.length * 3) / 4),
          model: modelUsed,
          metadata: JSON.stringify({
            provider: 'huggingface',
            modelUsed,
            wasFallback,
            attempts,
            format,
            mimeType,
            width: resolvedWidth,
            height: resolvedHeight,
            responseTimeMs,
          }),
          userId: user.id,
        },
      });
    } catch (dbError) {
      console.warn('[HF-Image] Failed to save asset to DB:', dbError);
      // Non-fatal — we still return the image
    }

    console.log(
      `[HF-Image] Success: prompt="${prompt.slice(0, 40)}..." model=${modelUsed} ` +
      `fallback=${wasFallback} attempts=${attempts} time=${responseTimeMs}ms`
    );

    // ─── Return Response ──────────────────────────────────────────
    return NextResponse.json({
      success: true,
      base64,
      format,
      mimeType,
      modelUsed,
      wasFallback,
      attempts,
    });
  } catch (error) {
    console.error('[HF-Image] Unhandled error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء توليد الصورة. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
