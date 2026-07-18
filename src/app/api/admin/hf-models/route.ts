// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Admin HF Models Management API
// ═══════════════════════════════════════════════════════════════════════
// GET    /api/admin/hf-models           — Returns all HF models with status
// POST   /api/admin/hf-models           — Test a model (action: "test"|"bulk-test")
// PATCH  /api/admin/hf-models           — Disable/enable a model (action: "disable"|"enable")
//
// Auth required (admin only)
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { getChatModels, getAllChatModelIds, getChatModelById, type HFChatModelEntry } from '@/lib/hf-chat.service';
import { HF_IMAGE_MODELS, getAllImageModelIds, getImageModelById, type HFImageModelEntry } from '@/lib/hf-image.service';
import { HF_VIDEO_MODELS, getAllVideoModelIds, getVideoModelById, type HFVideoModelEntry } from '@/lib/hf-video.service';
import { DOCUMENT_MODELS, getAllDocumentModelIds, getDocumentModelById, testDocumentModel, type DocumentModelEntry } from '@/lib/hf-document.service';
import { getHFLoadBalancer } from '@/lib/hf-load-balancer';
import { db } from '@/lib/db';
import { invalidateDisabledModelsCache } from '@/lib/disabled-models';

// ─── Disabled Models Persistence (Database) ─────────────────────────────

async function readDisabledModels(): Promise<string[]> {
  try {
    const disabled = await db.hFDisabledModel.findMany({
      select: { modelId: true },
    });
    return disabled.map(d => d.modelId);
  } catch {
    return [];
  }
}

async function writeDisabledModels(models: string[]): Promise<void> {
  try {
    // Get current disabled models
    const current = await db.hFDisabledModel.findMany({
      select: { modelId: true },
    });
    const currentIds = new Set(current.map(d => d.modelId));
    const newIds = new Set(models);

    // Add new disabled models
    const toAdd = models.filter(id => !currentIds.has(id));
    if (toAdd.length > 0) {
      await db.hFDisabledModel.createMany({
        data: toAdd.map(id => ({ modelId: id })),
        skipDuplicates: true,
      });
    }

    // Remove models that are no longer disabled
    const toRemove = current.filter(d => !newIds.has(d.modelId)).map(d => d.modelId);
    if (toRemove.length > 0) {
      await db.hFDisabledModel.deleteMany({
        where: { modelId: { in: toRemove } },
      });
    }
  } catch (error) {
    console.error('[HF-Models] Failed to sync disabled models to DB:', error);
  }
}

// ─── Auth Helper ─────────────────────────────────────────────────────

async function authenticateAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  const user = await getUserFromToken(token);
  if (!user || user.role !== 'admin') return null;

  return user;
}

// ─── GET: Return all models with status ──────────────────────────────

export async function GET(request: NextRequest) {
  const user = await authenticateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const lb = getHFLoadBalancer();
    const disabledModels = await readDisabledModels();

    // Chat models
    const chatModelIds = getAllChatModelIds();
    const chatModels = chatModelIds.map((id) => {
      const entry = getChatModelById(id);
      const health = lb.getHealthStats(id);
      return {
        ...(entry || {}),
        id,
        disabled: disabledModels.includes(id),
        health: health ? {
          usable: lb.isModelUsable(id),
          rateLimited: health.rateLimited,
          loading: health.loading,
          unavailable: health.unavailable,
          successCount: health.successCount,
          failCount: health.failCount,
          avgResponseMs: Math.round(health.avgResponseMs),
        } : null,
      };
    });

    // Image models
    const imageModelIds = getAllImageModelIds();
    const imageModels = imageModelIds.map((id) => {
      const entry = getImageModelById(id);
      const health = lb.getHealthStats(id);
      return {
        ...(entry || {}),
        id,
        disabled: disabledModels.includes(id),
        health: health ? {
          usable: lb.isModelUsable(id),
          rateLimited: health.rateLimited,
          loading: health.loading,
          unavailable: health.unavailable,
          successCount: health.successCount,
          failCount: health.failCount,
          avgResponseMs: Math.round(health.avgResponseMs),
        } : null,
      };
    });

    // Video models
    const videoModelIds = getAllVideoModelIds();
    const videoModels = videoModelIds.map((id) => {
      const entry = getVideoModelById(id);
      const health = lb.getHealthStats(id);
      return {
        ...(entry || {}),
        id,
        disabled: disabledModels.includes(id),
        health: health ? {
          usable: lb.isModelUsable(id),
          rateLimited: health.rateLimited,
          loading: health.loading,
          unavailable: health.unavailable,
          successCount: health.successCount,
          failCount: health.failCount,
          avgResponseMs: Math.round(health.avgResponseMs),
        } : null,
      };
    });

    return NextResponse.json({
      chat: { models: chatModels, total: chatModels.length },
      image: { models: imageModels, total: imageModels.length },
      video: { models: videoModels, total: videoModels.length },
      document: {
        models: getAllDocumentModelIds().map((id) => {
          const entry = getDocumentModelById(id);
          return {
            ...(entry || {}),
            id,
            disabled: disabledModels.includes(id),
          };
        }),
        total: getAllDocumentModelIds().length,
      },
      disabledModels,
    });
  } catch (error) {
    console.error('[Admin-HF-Models] GET error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب النماذج' }, { status: 500 });
  }
}

// ─── POST: Test model(s) ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await authenticateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, type, modelId, modelIds } = body;

    if (action === 'test') {
      return await testModel(type, modelId);
    }

    if (action === 'bulk-test') {
      return await bulkTestModels(type, modelIds);
    }

    return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 });
  } catch (error) {
    console.error('[Admin-HF-Models] POST error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء اختبار النموذج' }, { status: 500 });
  }
}

// ─── PATCH: Disable/enable model ─────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const user = await authenticateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, modelId } = body;

    if (!modelId || !action) {
      return NextResponse.json({ error: 'معرف النموذج والإجراء مطلوبان' }, { status: 400 });
    }

    const disabledModels = await readDisabledModels();

    if (action === 'disable') {
      if (!disabledModels.includes(modelId)) {
        disabledModels.push(modelId);
        await writeDisabledModels(disabledModels);
        invalidateDisabledModelsCache(); // Clear cache so models API picks up the change
      }
      return NextResponse.json({ success: true, modelId, disabled: true });
    }

    if (action === 'enable') {
      const updated = disabledModels.filter((id: string) => id !== modelId);
      await writeDisabledModels(updated);
      invalidateDisabledModelsCache(); // Clear cache so models API picks up the change
      return NextResponse.json({ success: true, modelId, disabled: false });
    }

    return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 });
  } catch (error) {
    console.error('[Admin-HF-Models] PATCH error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث النموذج' }, { status: 500 });
  }
}

// ─── Model Testing Logic ─────────────────────────────────────────────

const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';

async function testModel(type: string, modelId: string): Promise<NextResponse> {
  if (!type || !modelId) {
    return NextResponse.json({ error: 'النوع ومعرف النموذج مطلوبان' }, { status: 400 });
  }

  const startTime = Date.now();

  try {
    if (type === 'chat') {
      // Test chat model via OpenAI-compatible endpoint
      const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(HF_API_TOKEN ? { Authorization: `Bearer ${HF_API_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.status === 503) {
        const errorText = await response.text().catch(() => '');
        if (errorText.includes('loading') || errorText.includes('currently loading')) {
          getHFLoadBalancer().recordFailure(modelId, 'loading');
          return NextResponse.json({
            success: false,
            responseTimeMs,
            status: 'loading',
            error: 'النموذج قيد التحميل (بداية باردة)',
          });
        }
        getHFLoadBalancer().recordFailure(modelId, 'error');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'failed',
          error: `خطأ 503: ${errorText.slice(0, 200)}`,
        });
      }

      if (response.status === 429) {
        getHFLoadBalancer().recordFailure(modelId, 'rate_limit');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'rate-limited',
          error: 'تم تجاوز حد الطلبات',
        });
      }

      // 400 = model not deployed on free serverless inference
      if (response.status === 400) {
        const errorText = await response.text().catch(() => '');
        getHFLoadBalancer().recordFailure(modelId, 'error');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'not-deployed',
          error: 'النموذج غير متاح على الـ Serverless API المجاني',
          detail: errorText.slice(0, 150),
        });
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        getHFLoadBalancer().recordFailure(modelId, 'error');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'failed',
          error: `خطأ ${response.status}: ${errorText.slice(0, 200)}`,
        });
      }

      getHFLoadBalancer().recordSuccess(modelId, responseTimeMs);
      return NextResponse.json({
        success: true,
        responseTimeMs,
        status: 'available',
      });
    }

    if (type === 'image') {
      const imageModel = getImageModelById(modelId);
      const modelType = imageModel?.type || 'inference';

      // ─── Gradio Space image models ───
      if (modelType === 'gradio' && imageModel?.spaceName) {
        const spaceUrl = `https://${imageModel.spaceName.replace('/', '-')}.hf.space`;
        try {
          const response = await fetch(spaceUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(15_000),
          });
          const responseTimeMs = Date.now() - startTime;

          if (response.ok || response.status === 200 || response.status === 302 || response.status === 303) {
            getHFLoadBalancer().recordSuccess(modelId, responseTimeMs);
            return NextResponse.json({
              success: true,
              responseTimeMs,
              status: 'available',
            });
          }
          if (response.status === 401 || response.status === 403) {
            getHFLoadBalancer().recordSuccess(modelId, responseTimeMs);
            return NextResponse.json({
              success: true,
              responseTimeMs,
              status: 'available',
              error: 'الSpace يعمل لكن يتطلب مصادقة',
            });
          }
          if (response.status === 502 || response.status === 503 || response.status === 504) {
            return NextResponse.json({
              success: false,
              responseTimeMs,
              status: 'loading',
              error: 'المساحة نائمة أو قيد التحميل - جرب تاني بعد دقيقة',
            });
          }
          if (response.status === 404) {
            return NextResponse.json({
              success: false,
              responseTimeMs,
              status: 'sleeping',
              error: 'المساحة نائمة ( Sleeping ) أو غير موجودة',
            });
          }
          return NextResponse.json({
            success: false,
            responseTimeMs,
            status: 'failed',
            error: `حالة المساحة: ${response.status}`,
          });
        } catch {
          const responseTimeMs = Date.now() - startTime;
          return NextResponse.json({
            success: false,
            responseTimeMs,
            status: 'timeout',
            error: 'المساحة نائمة أو بطيئة - جرب تاني بعد دقيقة',
          });
        }
      }

      // ─── Inference API image models ───
      const hfModel = imageModel?.hfModel || modelId;
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${hfModel}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(HF_API_TOKEN ? { Authorization: `Bearer ${HF_API_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          inputs: 'test',
          parameters: { width: 64, height: 64 },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.status === 503) {
        getHFLoadBalancer().recordFailure(modelId, 'loading');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'loading',
          error: 'النموذج قيد التحميل',
        });
      }

      if (response.status === 429) {
        getHFLoadBalancer().recordFailure(modelId, 'rate_limit');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'rate-limited',
          error: 'تم تجاوز حد الطلبات',
        });
      }

      // For image models, even a non-OK response might mean the model exists
      // but we just didn't send the right format. Check content-type.
      const contentType = response.headers.get('content-type') || '';
      if (response.ok || contentType.includes('image')) {
        getHFLoadBalancer().recordSuccess(modelId, responseTimeMs);
        return NextResponse.json({
          success: true,
          responseTimeMs,
          status: 'available',
        });
      }

      // 400 = model exists but not deployed on free Inference API
      if (response.status === 400) {
        const errorText = await response.text().catch(() => '');
        getHFLoadBalancer().recordFailure(modelId, 'error');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'not-deployed',
          error: 'النموذج غير متاح على الـ Inference API المجاني (يتطلب اشتراك مدفوع)',
          detail: errorText.slice(0, 150),
        });
      }

      // 401/403 = gated model requiring acceptance
      if (response.status === 401 || response.status === 403) {
        getHFLoadBalancer().recordFailure(modelId, 'error');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'gated',
          error: 'نموذج مقيد - يتطلب موافقة ومفتاح API صالح',
        });
      }

      getHFLoadBalancer().recordFailure(modelId, 'error');
      return NextResponse.json({
        success: false,
        responseTimeMs,
        status: 'failed',
        error: `خطأ ${response.status}`,
      });
    }

    if (type === 'video') {
      // Test video model by checking Gradio space accessibility
      const videoModel = getVideoModelById(modelId);
      const spaceName = videoModel?.spaceName || modelId;

      if (videoModel?.type === 'zhipuai') {
        // For ZhipuAI, just check if the model is registered
        return NextResponse.json({
          success: true,
          responseTimeMs: Date.now() - startTime,
          status: 'available',
        });
      }

      // Check if Gradio Space is accessible
      const spaceUrl = `https://${spaceName.replace('/', '-')}.hf.space`;
      try {
        const response = await fetch(spaceUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(15_000),
        });
        const responseTimeMs = Date.now() - startTime;

        if (response.ok || response.status === 200) {
          getHFLoadBalancer().recordSuccess(modelId, responseTimeMs);
          return NextResponse.json({
            success: true,
            responseTimeMs,
            status: 'available',
          });
        }

        // 401/403 = Space requires auth but is running
        if (response.status === 401 || response.status === 403) {
          getHFLoadBalancer().recordSuccess(modelId, responseTimeMs);
          return NextResponse.json({
            success: true,
            responseTimeMs,
            status: 'available',
            error: 'الSpace يعمل لكن يتطلب مصادقة',
          });
        }

        // 502/503/504 = Space might be sleeping/waking up, still potentially available
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          getHFLoadBalancer().recordFailure(modelId, 'loading');
          return NextResponse.json({
            success: false,
            responseTimeMs,
            status: 'loading',
            error: 'المساحة نائمة أو قيد التحميل - جرب تاني بعد دقيقة',
          });
        }

        // 404 = Space might be sleeping or doesn't exist
        if (response.status === 404) {
          return NextResponse.json({
            success: false,
            responseTimeMs,
            status: 'sleeping',
            error: 'المساحة نائمة ( Sleeping ) أو غير موجودة - ممكن تشتغل لو استنيت',
          });
        }

        getHFLoadBalancer().recordFailure(modelId, 'error');
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'failed',
          error: `حالة المساحة: ${response.status}`,
        });
      } catch {
        const responseTimeMs = Date.now() - startTime;
        // Timeout for Gradio spaces might just mean it's sleeping
        // Don't mark as permanent failure
        return NextResponse.json({
          success: false,
          responseTimeMs,
          status: 'timeout',
          error: 'المساحة نائمة أو بطيئة - جرب تاني بعد دقيقة',
        });
      }
    }

    if (type === 'document') {
      const result = await testDocumentModel(modelId);
      const responseTimeMs = result.responseTimeMs;
      if (result.available) {
        return NextResponse.json({
          success: true,
          responseTimeMs,
          status: 'available',
          error: result.error,
        });
      }
      return NextResponse.json({
        success: false,
        responseTimeMs,
        status: 'failed',
        error: result.error || 'النموذج غير متاح',
      });
    }

    return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 });
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.includes('timeout') || errorMsg.includes('abort')) {
      getHFLoadBalancer().recordFailure(modelId, 'timeout');
      return NextResponse.json({
        success: false,
        responseTimeMs,
        status: 'failed',
        error: 'انتهت مهلة الطلب',
      });
    }

    getHFLoadBalancer().recordFailure(modelId, 'error');
    return NextResponse.json({
      success: false,
      responseTimeMs,
      status: 'failed',
      error: errorMsg.slice(0, 200),
    });
  }
}

async function bulkTestModels(type: string, modelIds: string[]): Promise<NextResponse> {
  if (!type || !Array.isArray(modelIds) || modelIds.length === 0) {
    return NextResponse.json({ error: 'النوع وقائمة النماذج مطلوبان' }, { status: 400 });
  }

  const results: Array<{
    modelId: string;
    success: boolean;
    responseTimeMs?: number;
    status: string;
    error?: string;
  }> = [];

  // Test models sequentially to avoid rate limiting
  for (const mid of modelIds) {
    try {
      const result = await testModel(type, mid);
      const data = await result.json();
      results.push({ modelId: mid, ...data });
    } catch {
      results.push({ modelId: mid, success: false, status: 'failed', error: 'خطأ غير معروف' });
    }

    // Small delay between tests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return NextResponse.json({ results });
}
