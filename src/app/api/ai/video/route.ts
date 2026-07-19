import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { traceImage, traceError, traceDB } from '@/lib/trace-logger';
import { getVideoGenModelById, DEFAULT_VIDEO_MODEL, type VideoGenModel } from '@/lib/video-models';
import { reportSuccess as reportAggregatorSuccess, reportFailure as reportAggregatorFailure } from '@/lib/api-aggregator/reporter';
import { resolveHFModelId, buildHFInferenceUrl } from '@/lib/hf-model-resolve';

// Set max duration for this API route (video generation can take up to 7 minutes)
export const maxDuration = 420;

// ═══════════════════════════════════════════════════════════════════
// VIDEO MODEL ROUTING — SIMPLIFIED (HuggingFace only)
// ═══════════════════════════════════════════════════════════════════
// All video models now use HuggingFace Gradio Spaces.
// Previous providers (Z-AI/ZhipuAI/Pollinations) have been removed
// because they have strict content filters that reject most prompts.
//
// Fallback order:
//   1. User-selected HF model
//   2. Other available HF models (by speed/quality)
// ═══════════════════════════════════════════════════════════════════

// Preferred fallback order (fastest/most reliable first)
const HF_FALLBACK_ORDER = [
  'cogvideox-2b',
  'ltx-video-distilled',
  'cogvideox-5b',
  'ltx-2-3',
  'wan21-fast-i2v',
  'ltx-video-distilled-i2v',
  'stable-video-diffusion',
];

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

    let body: { prompt?: string; quality?: string; duration?: number; image_url?: string; model?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
    }

    const { prompt, quality, duration, image_url, model } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'يرجى إدخال وصف الفيديو' }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════════
    // RESOLVE MODEL
    // ═══════════════════════════════════════════════════════════════
    const videoModelConfig = getVideoGenModelById(model ?? '');

    // ── Custom Video Model Bridge (from Aggregator) ──
    let customVideoModel: any = null;
    let isCustomVideoModel = false;
    if (!videoModelConfig && model?.startsWith('custom:video:')) {
      const customModelId = model.split(':').slice(2).join(':');
      try {
        const cm = await db.customModel.findUnique({ where: { id: customModelId } });
        if (cm && cm.isActive && cm.category === 'video') {
          // Resolve short HF model IDs to full paths
          if (cm.modelId) {
            const resolvedId = resolveHFModelId(cm.modelId);
            if (resolvedId && resolvedId !== cm.modelId) {
              cm.modelId = resolvedId;
            }
          }
          customVideoModel = cm;
          isCustomVideoModel = true;
        }
      } catch (err) {
        console.warn('[Video] Failed to load custom model:', err);
      }
    }

    let hfVideoModelId: string;
    let modelLabel: string;

    if (isCustomVideoModel && customVideoModel) {
      hfVideoModelId = customVideoModel.modelId || customVideoModel.nameEn;
      modelLabel = customVideoModel.nameEn || customVideoModel.name;
    } else if (videoModelConfig && videoModelConfig.provider === 'huggingface') {
      hfVideoModelId = videoModelConfig.backendModel;
      modelLabel = videoModelConfig.nameEn;
    } else {
      // Fallback to default model
      const defaultConfig = getVideoGenModelById(DEFAULT_VIDEO_MODEL);
      hfVideoModelId = defaultConfig?.backendModel || 'cogvideox-2b';
      modelLabel = defaultConfig?.nameEn || 'CogVideoX-2B';
    }

    // Apply Prompt Engineering Engine
    const { optimizePrompt, detectVideoModelFamily } = await import('@/lib/prompt-engine');
    const videoModelFamily = detectVideoModelFamily(model || '');
    const engineOptimizedPrompt = optimizePrompt(prompt.trim(), {
      category: 'video' as const,
      modelFamily: videoModelFamily,
      isArabic: true,
    });

    traceImage(`توليد فيديو: ${prompt.slice(0, 50)} [model: ${hfVideoModelId}, label: ${modelLabel}]`);
    const videoStartTime = Date.now();

    // ── Custom Video Model Path ──
    if (isCustomVideoModel && customVideoModel) {
      try {
        const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (customVideoModel.apiKey) {
          if (customVideoModel.authType === 'bearer') customHeaders['Authorization'] = `Bearer ${customVideoModel.apiKey}`;
          else if (customVideoModel.authType === 'x-api-key') customHeaders[customVideoModel.authHeader || 'x-api-key'] = customVideoModel.apiKey;
          else if (customVideoModel.authType === 'custom' && customVideoModel.authHeader) customHeaders[customVideoModel.authHeader] = customVideoModel.apiKey;
        }

        if (customVideoModel.apiFormat === 'hf-inference') {
          // HuggingFace Inference API for video — uses inputs field, may require polling
          const hfVideoUrl = buildHFInferenceUrl(customVideoModel.baseUrl, customVideoModel.modelId);
          const resolvedModelId = resolveHFModelId(customVideoModel.modelId) || customVideoModel.modelId || customVideoModel.nameEn;

          const hfBody: Record<string, any> = { inputs: engineOptimizedPrompt };
          if (image_url) hfBody.parameters = { image_url };
          const response = await fetch(hfVideoUrl, {
            method: 'POST',
            headers: customHeaders,
            body: JSON.stringify(hfBody),
            signal: AbortSignal.timeout(300_000),
          });
          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`فشل تحميل نموذج الاستدلال: '${resolvedModelId}' أرجع ${response.status}: ${errText.slice(0, 200)}`);
          }
          const contentType = response.headers.get('content-type') || '';
          let videoUrl: string | null = null;
          if (contentType.includes('video') || contentType.includes('octet-stream')) {
            // Direct binary video — save as data URL
            const arrayBuffer = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            videoUrl = `data:video/mp4;base64,${base64}`;
          } else {
            const data = await response.json();
            videoUrl = data.videoUrl || data.video_url || data.url || data.data?.url;
          }
          if (videoUrl) {
            await db.generativeAsset.create({
              data: {
                type: 'video',
                title: prompt.slice(0, 100),
                prompt: prompt,
                filePath: videoUrl,
                fileSize: 0,
                model: customVideoModel.modelId || hfVideoModelId,
                userId: user?.id,
                metadata: JSON.stringify({ duration: duration || 5, provider: 'huggingface', source: 'custom-hf', modelLabel }),
              },
            });
            return NextResponse.json({ success: true, videoUrl, model: hfVideoModelId, modelLabel, provider: 'huggingface' });
          }
          throw new Error('لم يتم إرجاع رابط فيديو من HuggingFace');
        }

        const response = await fetch(customVideoModel.baseUrl, {
          method: 'POST',
          headers: customHeaders,
          body: JSON.stringify({
            model: customVideoModel.modelId || hfVideoModelId,
            prompt: engineOptimizedPrompt,
            duration: duration || 5,
            image_url,
          }),
          signal: AbortSignal.timeout(300_000),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Custom endpoint returned ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const videoUrl = data.videoUrl || data.video_url || data.url || data.data?.url;

        if (videoUrl) {
          await db.generativeAsset.create({
            data: {
              type: 'video',
              title: prompt.slice(0, 100),
              prompt: prompt,
              filePath: videoUrl,
              fileSize: 0,
              model: model || customVideoModel.modelId,
              metadata: JSON.stringify({
                provider: 'custom',
                realModel: customVideoModel.modelId,
                modelUsed: modelLabel,
                videoUrl,
              }),
              userId: user.id,
            },
          });

          reportAggregatorSuccess('custom', 'video', Date.now() - videoStartTime);
          return NextResponse.json({
            success: true,
            videoUrl,
            model: modelLabel,
            provider: 'custom',
            realModel: customVideoModel.modelId,
          });
        } else {
          throw new Error('No video URL in response from custom endpoint');
        }
      } catch (customErr) {
        reportAggregatorFailure('custom', 'video', customErr instanceof Error ? customErr.message : String(customErr));
        return NextResponse.json({
          success: false,
          error: customErr instanceof Error ? customErr.message : 'خطأ في توليد الفيديو من نقطة النهاية المخصصة',
          provider: 'custom',
        }, { status: 500 });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // GENERATE VIDEO VIA BIGMODEL (CogVideoX-Flash — FREE, async)
    // ═══════════════════════════════════════════════════════════════
    // Try BigModel first when:
    //   - No image_url provided (T2V only — BigModel doesn't do I2V reliably)
    //   - User didn't explicitly select an HF model OR selected the default
    // If BigModel fails (content filter, network, timeout) → fall through to HF.
    if (!image_url && (!videoModelConfig || videoModelConfig.id === DEFAULT_VIDEO_MODEL)) {
      try {
        const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
        const ZAI_BASE = 'https://open.bigmodel.cn/api/paas/v4';

        if (ZAI_API_KEY) {
          traceImage(`[BigModel] Submitting CogVideoX-Flash task: "${engineOptimizedPrompt.slice(0, 60)}..."`);

          const submitRes = await fetch(`${ZAI_BASE}/videos/generations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ZAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'cogvideox-flash',  // ✅ FREE
              prompt: engineOptimizedPrompt,
              duration: duration || 5,
              quality: quality || 'speed',
            }),
            signal: AbortSignal.timeout(30_000),
          });

          if (submitRes.ok) {
            const submitData = await submitRes.json();
            const taskId = submitData?.id || submitData?.task_id || '';

            if (taskId) {
              traceImage(`[BigModel] Task started: ${taskId}. Polling for up to 2 min...`);

              // Poll for up to 2 minutes
              const pollDeadline = Date.now() + 120_000;
              const pollInterval = 5_000;
              let bigModelVideoUrl = '';
              let bigModelCoverUrl = '';

              while (Date.now() < pollDeadline) {
                try {
                  const pollRes = await fetch(`${ZAI_BASE}/async-result/${taskId}`, {
                    headers: { 'Authorization': `Bearer ${ZAI_API_KEY}` },
                    signal: AbortSignal.timeout(15_000),
                  });

                  if (pollRes.ok) {
                    const pollData = await pollRes.json();
                    const status = pollData?.task_status || 'PROCESSING';

                    if (status === 'SUCCESS') {
                      const vResult = pollData?.video_result?.[0] || {};
                      bigModelVideoUrl = vResult.url || vResult.video_url || '';
                      bigModelCoverUrl = vResult.cover_image_url || '';
                      break;
                    }
                    if (status === 'FAIL') {
                      traceImage(`[BigModel] Task FAILED: ${pollData?.msg || 'unknown'}`);
                      break;
                    }
                  }
                } catch (pollErr) {
                  traceImage(`[BigModel] Poll error: ${pollErr instanceof Error ? pollErr.message : String(pollErr)}`);
                }

                await new Promise((r) => setTimeout(r, pollInterval));
              }

              if (bigModelVideoUrl) {
                traceImage(`[BigModel] ✅ Video generated: ${bigModelVideoUrl.slice(0, 80)}`);

                traceDB('حفظ فيديو BigModel في قاعدة البيانات');
                await db.generativeAsset.create({
                  data: {
                    type: 'video',
                    title: prompt.slice(0, 100),
                    prompt: prompt,
                    filePath: bigModelVideoUrl,
                    fileSize: 0,
                    model: model || 'cogvideox-flash',
                    metadata: JSON.stringify({
                      provider: 'bigmodel',
                      realModel: 'cogvideox-flash',
                      modelUsed: 'CogVideoX-Flash',
                      backendModel: 'cogvideox-flash',
                      videoUrl: bigModelVideoUrl,
                      coverUrl: bigModelCoverUrl,
                      durationMs: Date.now() - videoStartTime,
                      taskId,
                    }),
                    userId: user.id,
                  },
                });

                reportAggregatorSuccess('bigmodel', 'video', Date.now() - videoStartTime);

                return NextResponse.json({
                  success: true,
                  videoUrl: bigModelVideoUrl,
                  hasVideoData: false,
                  model: 'CogVideoX-Flash',
                  provider: 'bigmodel',
                  realModel: 'cogvideox-flash',
                  backendModel: 'cogvideox-flash',
                  coverUrl: bigModelCoverUrl,
                  taskId,
                });
              } else {
                traceImage('[BigModel] No video URL after polling — falling back to HF');
              }
            }
          } else {
            const errText = await submitRes.text().catch(() => '');
            traceImage(`[BigModel] Submit failed ${submitRes.status}: ${errText.slice(0, 150)} — falling back to HF`);
          }
        } else {
          traceImage('[BigModel] ZAI_API_KEY not set — skipping BigModel, going to HF');
        }
      } catch (bigModelErr) {
        traceImage(`[BigModel] Error: ${bigModelErr instanceof Error ? bigModelErr.message : String(bigModelErr)} — falling back to HF`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // GENERATE VIDEO VIA HUGGINGFACE (fallback)
    // ═══════════════════════════════════════════════════════════════

    const { generateHFVideo, getVideoModelById: getHFVideoModel } = await import('@/lib/hf-video.service');

    // Try the selected model first
    const modelsToTry = [hfVideoModelId];
    // Add fallback models (excluding the primary one)
    for (const fallbackId of HF_FALLBACK_ORDER) {
      if (fallbackId !== hfVideoModelId && !modelsToTry.includes(fallbackId)) {
        modelsToTry.push(fallbackId);
      }
    }

    let lastError: Error | null = null;

    for (const tryModelId of modelsToTry) {
      const hfVideoEntry = getHFVideoModel(tryModelId);
      if (!hfVideoEntry) continue;

      // Skip I2V-only models if no image provided
      if (hfVideoEntry.supportedModes.length === 1 && hfVideoEntry.supportedModes[0] === 'image2video' && !image_url) {
        continue;
      }

      try {
        traceImage(`[HuggingFace] محاولة توليد فيديو باستخدام ${tryModelId}...`);

        const hfResult = await generateHFVideo(engineOptimizedPrompt, tryModelId, {
          duration: duration || 5,
          image_url,
        });

        if (hfResult.videoUrl) {
          const usedFallback = tryModelId !== hfVideoModelId;
          traceImage(`[HuggingFace] نجاح! model=${hfResult.model}, url=${hfResult.videoUrl.slice(0, 80)}...${usedFallback ? ' (fallback)' : ''}`);

          traceDB('حفظ فيديو HuggingFace في قاعدة البيانات');
          await db.generativeAsset.create({
            data: {
              type: 'video',
              title: prompt.slice(0, 100),
              prompt: prompt,
              filePath: hfResult.videoUrl,
              fileSize: 0,
              model: model || hfResult.model,
              metadata: JSON.stringify({
                provider: 'huggingface',
                realModel: hfResult.model,
                modelUsed: modelLabel,
                backendModel: tryModelId,
                videoUrl: hfResult.videoUrl,
                hasBase64: !!hfResult.base64,
                durationMs: hfResult.durationMs,
                fallback: usedFallback,
              }),
              userId: user.id,
            },
          });

          traceImage(`تم توليد الفيديو: [${modelLabel} → ${hfResult.model}] in ${(hfResult.durationMs / 1000).toFixed(1)}s`);
          reportAggregatorSuccess('huggingface', 'video', Date.now() - videoStartTime);

          return NextResponse.json({
            success: true,
            videoUrl: hfResult.videoUrl,
            hasVideoData: !!hfResult.base64,
            model: modelLabel,
            provider: 'huggingface',
            realModel: hfResult.model,
            backendModel: tryModelId,
          });
        }
      } catch (hfVideoError) {
        const errMessage = hfVideoError instanceof Error ? hfVideoError.message : String(hfVideoError);
        lastError = hfVideoError instanceof Error ? hfVideoError : new Error(errMessage);

        // If it's a content filter error, don't try other models (they're all open)
        if (errMessage.includes('content') || errMessage.includes('inappropriate') || errMessage.includes('sensitive')) {
          traceImage(`[HuggingFace] محجوب بفلتر: model=${tryModelId}`);
          break;
        }

        traceImage(`[HuggingFace] فشل ${tryModelId}: ${errMessage.slice(0, 100)}`);
        reportAggregatorFailure('huggingface', 'video', errMessage);
        // Continue to next fallback model
        continue;
      }
    }

    // All models failed
    const errorMsg = lastError?.message || 'فشلت جميع المحاولات';
    traceError(`فشلت جميع محاولات توليد الفيديو: ${errorMsg.slice(0, 150)}`);
    reportAggregatorFailure('huggingface', 'video', errorMsg);

    // Provide user-friendly error messages
    if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
      return NextResponse.json(
        { error: 'انتهت مهلة توليد الفيديو. المساحات قد تكون مشغولة — جرّب مرة أخرى بعد دقيقة.' },
        { status: 408 }
      );
    }

    if (errorMsg.includes('not available') || errorMsg.includes('sleeping') || errorMsg.includes('503')) {
      return NextResponse.json(
        { error: 'المساحات الحالية نائمة. جرّب مرة أخرى بعد دقيقة — أو جرّب نموذج مختلف.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'حدث خطأ أثناء توليد الفيديو. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  } catch (error) {
    traceError(`خطأ عام في توليد الفيديو: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء توليد الفيديو. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
