// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Video Generation API
// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/hf/video
// Generates videos using HuggingFace models (10 models available).
// Supports text-to-video and image-to-video modes with automatic fallback.
//
// Auth is required — same pattern as the existing /api/ai/video route.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  generateHFVideo,
  generateVideoWithFallback,
  getVideoModelById,
  HF_VIDEO_MODELS,
  type HFVideoGenerateOptions,
} from '@/lib/hf-video.service';
import { isModelDisabled } from '@/lib/disabled-models';

// Set max duration for this API route (video generation can take minutes)
export const maxDuration = 60;

/** Request body schema */
interface VideoRequestBody {
  prompt: string;
  model?: string;
  duration?: number;
  image_url?: string;
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
    let body: VideoRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'طلب غير صالح. يرجى التحقق من تنسيق البيانات.' },
        { status: 400 }
      );
    }

    const { prompt, model, duration, image_url, fallbackModels } = body;

    // ─── Validate Prompt ──────────────────────────────────────────
    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'يرجى إدخال وصف الفيديو' },
        { status: 400 }
      );
    }

    // ─── Resolve Model ────────────────────────────────────────────
    const resolvedModel = model || 'cogvideox-2b'; // Default to fastest model

    const modelEntry = getVideoModelById(resolvedModel);
    if (!modelEntry) {
      const availableModels = Object.entries(HF_VIDEO_MODELS)
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

    // ─── Validate image2video Mode ────────────────────────────────
    if (image_url && !modelEntry.supportedModes.includes('image2video')) {
      return NextResponse.json(
        {
          error: `النموذج "${resolvedModel}" لا يدعم تحويل الصور إلى فيديو. النماذج المدعومة: ${Object.values(HF_VIDEO_MODELS)
            .filter((m) => m.supportedModes.includes('image2video'))
            .map((m) => m.id)
            .join(', ')}`,
        },
        { status: 400 }
      );
    }

    // ─── Build Generation Options ─────────────────────────────────
    const genOptions: HFVideoGenerateOptions = {
      duration: duration || 5,
      image_url: image_url || undefined,
      returnBase64: false,
    };

    // ─── Validate Fallback Models ─────────────────────────────────
    let validFallbacks: string[] | undefined;
    if (fallbackModels && Array.isArray(fallbackModels) && fallbackModels.length > 0) {
      validFallbacks = fallbackModels.filter(
        (id) => getVideoModelById(id) !== undefined
      );
      if (validFallbacks.length === 0) {
        validFallbacks = undefined;
      }
    }

    // ─── Generate Video ───────────────────────────────────────────
    const startTime = Date.now();
    let videoUrl: string;
    let modelUsed: string;
    let wasFallback = false;
    let attempts = 1;

    if (validFallbacks && validFallbacks.length > 0) {
      // Use fallback generation with explicit fallback list
      const allModels = [resolvedModel, ...validFallbacks];

      try {
        const result = await generateVideoWithFallback(prompt, allModels, genOptions);
        videoUrl = result.videoUrl;
        modelUsed = result.model;
        wasFallback = result.usedFallback;
        attempts = result.attemptedModels.length;
      } catch (fallbackError) {
        console.error('[HF-Video] All fallback models failed:', fallbackError);
        return NextResponse.json(
          {
            error: 'فشل توليد الفيديو من جميع النماذج المتاحة. يرجى المحاولة مرة أخرى.',
            detail: fallbackError instanceof Error ? fallbackError.message : 'خطأ غير معروف',
          },
          { status: 500 }
        );
      }
    } else {
      // Single model generation, with automatic fallback via load balancer
      try {
        const result = await generateHFVideo(prompt, resolvedModel, genOptions);
        videoUrl = result.videoUrl;
        modelUsed = result.model;
      } catch (genError) {
        console.warn(
          `[HF-Video] Model ${resolvedModel} failed, trying automatic fallback: ${
            genError instanceof Error ? genError.message.slice(0, 100) : 'خطأ'
          }`
        );

        // Try automatic fallback with all available models
        try {
          const fallbackResult = await generateVideoWithFallback(
            prompt,
            undefined, // Use default model order from load balancer
            genOptions
          );
          videoUrl = fallbackResult.videoUrl;
          modelUsed = fallbackResult.model;
          wasFallback = true;
          attempts = fallbackResult.attemptedModels.length;
        } catch (finalError) {
          console.error('[HF-Video] Final fallback failed:', finalError);
          return NextResponse.json(
            {
              error: 'فشل توليد الفيديو. يرجى المحاولة مرة أخرى لاحقاً.',
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
          type: 'video',
          title: prompt.slice(0, 100),
          prompt: prompt,
          filePath: videoUrl.startsWith('data:') ? videoUrl.slice(0, 50) + '...' : videoUrl,
          fileSize: 0,
          model: modelUsed,
          metadata: JSON.stringify({
            provider: 'huggingface',
            modelUsed,
            wasFallback,
            attempts,
            duration: duration || 5,
            hasImageUrl: !!image_url,
            responseTimeMs,
          }),
          userId: user.id,
        },
      });
    } catch (dbError) {
      console.warn('[HF-Video] Failed to save asset to DB:', dbError);
      // Non-fatal — we still return the video URL
    }

    console.log(
      `[HF-Video] Success: prompt="${prompt.slice(0, 40)}..." model=${modelUsed} ` +
      `fallback=${wasFallback} attempts=${attempts} time=${responseTimeMs}ms`
    );

    // ─── Return Response ──────────────────────────────────────────
    return NextResponse.json({
      success: true,
      videoUrl,
      modelUsed,
      wasFallback,
      attempts,
    });
  } catch (error) {
    console.error('[HF-Video] Unhandled error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء توليد الفيديو. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
