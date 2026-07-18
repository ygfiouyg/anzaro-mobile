import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveHFModelId, fixHFBaseUrl, HF_DEFAULT_MODEL_IDS } from '@/lib/hf-model-resolve';

// ─── Helper: Quick validation test for a model endpoint ────────────────
async function quickValidateEndpoint(config: {
  baseUrl: string;
  apiKey?: string | null;
  authType?: string | null;
  authHeader?: string | null;
  apiFormat: string;
  category: string;
  modelId?: string | null;
}): Promise<{ valid: boolean; status?: number; error?: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      if (config.authType === 'bearer') headers['Authorization'] = `Bearer ${config.apiKey}`;
      else if (config.authType === 'x-api-key') headers[config.authHeader || 'x-api-key'] = config.apiKey;
      else if (config.authType === 'custom' && config.authHeader) headers[config.authHeader] = config.apiKey;
    }

    let url = config.baseUrl;
    let options: RequestInit;

    if (config.apiFormat === 'pollinations' && config.category === 'image') {
      // Pollinations image: simple GET test
      url = `${config.baseUrl}test?width=64&height=64`;
      options = { method: 'GET', headers, signal: AbortSignal.timeout(15_000) };
    } else if (config.apiFormat === 'hf-inference') {
      // HF Inference: construct correct URL if needed
      if (config.modelId && (
        url.includes('router.huggingface.co/v1') ||
        url === 'https://router.huggingface.co' ||
        url === 'https://api-inference.huggingface.co'
      )) {
        url = `https://api-inference.huggingface.co/models/${config.modelId}`;
      }
      if (config.category === 'chat') {
        // Chat models use OpenAI format via router
        url = 'https://router.huggingface.co/v1/chat/completions';
        options = {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.modelId || 'default',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(20_000),
        };
      } else {
        // Image/video models use HF Inference format
        options = {
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: 'test' }),
          signal: AbortSignal.timeout(20_000),
        };
      }
    } else if (config.apiFormat === 'openai') {
      // OpenAI-compatible: chat completions
      url = `${config.baseUrl}/chat/completions`;
      options = {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelId || 'default',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(20_000),
      };
    } else {
      // Generic: HEAD request
      options = { method: 'HEAD', signal: AbortSignal.timeout(10_000) };
    }

    const response = await fetch(url, options);

    if (response.ok) return { valid: true, status: response.status };
    if (response.status === 429) return { valid: true, status: 429, error: 'حد المعدل (النموذج يعمل لكنه مشغول)' };
    if (response.status === 503) return { valid: true, status: 503, error: 'النموذج قيد التحميل (سيعمل بعد قليل)' };

    const errText = await response.text().catch(() => '');
    return { valid: false, status: response.status, error: `HTTP ${response.status}: ${errText.slice(0, 150)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timeout') || msg.includes('abort')) {
      return { valid: true, error: 'انتهت المهلة لكن النقطة قد تعمل' };
    }
    return { valid: false, error: msg.slice(0, 150) };
  }
}

// resolveHFModelId, HF_DEFAULT_MODEL_IDS are now imported from @/lib/hf-model-resolve

// fixHFBaseUrl is now imported from @/lib/hf-model-resolve as fixHFBaseUrl
// (was previously called fixHBaseUrl locally)

// ─── GET: List custom models + promoted endpoint IDs ─────────────────
export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });

    const customModels = await db.customModel.findMany({
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    // Set of endpoint IDs that are already promoted
    const promotedEndpointIds = new Set(
      customModels.map(m => m.sourceEndpointId).filter(Boolean) as string[]
    );

    // Set of HF model IDs that are already added
    const addedHfModelIds = new Set(
      customModels.filter(m => m.provider === 'huggingface' && m.modelId).map(m => m.modelId!)
    );

    return NextResponse.json({
      models: customModels,
      promotedEndpointIds: Array.from(promotedEndpointIds),
      addedHfModelIds: Array.from(addedHfModelIds),
      total: customModels.length,
    });
  } catch (err) {
    console.error('[CustomModels] Fetch error:', err);
    return NextResponse.json({ error: 'خطأ في جلب النماذج المخصصة' }, { status: 500 });
  }
}

// ─── POST: Add model as custom model ────────────────────────────────
// Supports two modes:
// 1. From aggregator endpoint: { endpointId }
// 2. From HuggingFace model: { hfModelId, hfModelName, category }
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });

    const body = await request.json();
    const { endpointId, hfModelId, hfModelName, category } = body as {
      endpointId?: string;
      hfModelId?: string;
      hfModelName?: string;
      category?: string;
    };

    // ─── Mode 1: From aggregator endpoint ───
    if (endpointId) {
      const endpoint = await db.apiEndpoint.findUnique({ where: { id: endpointId } });
      if (!endpoint) return NextResponse.json({ error: 'نقطة النهاية غير موجودة' }, { status: 404 });
      if (!endpoint.isAvailable) return NextResponse.json({ error: 'نقطة النهاية غير متاحة' }, { status: 400 });

      // Check if already added
      const existing = await db.customModel.findFirst({
        where: { sourceEndpointId: endpointId },
      });
      if (existing) return NextResponse.json({ error: 'هذه النقطة مضافة بالفعل كنموذج مخصص', existingId: existing.id }, { status: 409 });

      // Fix baseUrl for HF models (router URL → correct inference URL)
      const { baseUrl: fixedBaseUrl, apiFormat: fixedApiFormat, modelId: fixedModelId } = fixHFBaseUrl(
        endpoint.baseUrl,
        endpoint.modelId,
        endpoint.category,
        endpoint.apiFormat,
        endpoint.provider
      );

      // Quick validation test
      const validation = await quickValidateEndpoint({
        baseUrl: fixedBaseUrl,
        apiKey: endpoint.apiKey,
        authType: endpoint.authType,
        authHeader: endpoint.authHeader,
        apiFormat: fixedApiFormat,
        category: endpoint.category,
        modelId: fixedModelId,
      });

      // Map category to icon
      const categoryIcons: Record<string, string> = { chat: '💬', image: '🖼️', video: '🎬', asr: '🎤', translation: '🌐' };

      const customModel = await db.customModel.create({
        data: {
          name: endpoint.name,
          nameEn: fixedModelId || endpoint.modelId || endpoint.name || endpoint.provider,
          category: endpoint.category,
          provider: endpoint.provider,
          baseUrl: fixedBaseUrl,
          modelId: fixedModelId || endpoint.modelId || null,
          apiKey: endpoint.apiKey,
          authType: endpoint.authType,
          authHeader: endpoint.authHeader,
          apiFormat: fixedApiFormat,
          isFree: endpoint.isFree,
          isActive: true,
          priority: endpoint.priority,
          icon: categoryIcons[endpoint.category] || '⚡',
          description: `${endpoint.provider} - ${endpoint.category}`,
          descriptionEn: `${endpoint.provider} - ${endpoint.category}`,
          sourceEndpointId: endpointId,
          addedBy: user.email || user.id,
          capabilities: endpoint.capabilities,
          metadata: endpoint.metadata,
        },
      });

      const response: Record<string, any> = {
        message: 'تم إضافة النموذج المخصص بنجاح',
        customModel: { id: customModel.id, name: customModel.name, category: customModel.category, provider: customModel.provider },
      };

      // Add validation warning if the model didn't pass
      if (!validation.valid) {
        response.warning = `⚠️ النموذج أُضيف لكن الفحص أرجع خطأ: ${validation.error}`;
        response.validationStatus = 'failed';
      } else if (validation.error) {
        response.warning = `ℹ️ النموذج أُضيف بنجاح. ملاحظة: ${validation.error}`;
        response.validationStatus = 'warning';
      } else {
        response.validationStatus = 'ok';
      }

      return NextResponse.json(response);
    }

    // ─── Mode 2: From HuggingFace model ───
    if (hfModelId && category) {
      // Check if already added as custom model with same HF model ID
      const existing = await db.customModel.findFirst({
        where: { modelId: hfModelId, provider: 'huggingface' },
      });
      if (existing) return NextResponse.json({ error: 'هذا النموذج مضاف بالفعل', existingId: existing.id }, { status: 409 });

      const validCategories = ['chat', 'image', 'video', 'asr', 'translation', 'document'];
      if (!validCategories.includes(category)) {
        return NextResponse.json({ error: `فئة غير صالحة: ${category}` }, { status: 400 });
      }

      const categoryIcons: Record<string, string> = { chat: '💬', image: '🖼️', video: '🎬', asr: '🎤', translation: '🌐', document: '📄' };
      const displayName = hfModelName || hfModelId.split('/').pop() || hfModelId;

      // Resolve short model ID to full path
      const resolvedHfModelId = resolveHFModelId(hfModelId) || hfModelId;

      // Build the base URL and API format based on category
      let baseUrl: string;
      let apiFormat: string;
      if (category === 'chat') {
        // Chat models use OpenAI-compatible format via HF Router
        baseUrl = 'https://router.huggingface.co/v1';
        apiFormat = 'openai';
      } else {
        // Image/video/other models use HF Inference API directly
        baseUrl = `https://api-inference.huggingface.co/models/${resolvedHfModelId}`;
        apiFormat = 'hf-inference';
      }

      const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '';

      // Quick validation test
      const validation = await quickValidateEndpoint({
        baseUrl,
        apiKey: hfToken,
        authType: hfToken ? 'bearer' : 'none',
        apiFormat,
        category,
        modelId: resolvedHfModelId,
      });

      const customModel = await db.customModel.create({
        data: {
          name: displayName,
          nameEn: resolvedHfModelId,
          category,
          provider: 'huggingface',
          baseUrl,
          modelId: resolvedHfModelId,
          apiKey: hfToken,
          authType: 'bearer',
          apiFormat,
          isFree: true,
          isActive: true,
          priority: 30,
          icon: categoryIcons[category] || '⚡',
          description: `HuggingFace ${category} model - ${displayName}`,
          descriptionEn: `HuggingFace ${category} model - ${resolvedHfModelId}`,
          addedBy: user.email || user.id,
          metadata: JSON.stringify({ source: 'hf-models-tab', hfModelId: resolvedHfModelId }),
        },
      });

      const response: Record<string, any> = {
        message: 'تم إضافة نموذج HuggingFace بنجاح',
        customModel: { id: customModel.id, name: customModel.name, category: customModel.category, provider: customModel.provider },
      };

      // Add validation warning if the model didn't pass
      if (!validation.valid) {
        response.warning = `⚠️ النموذج أُضيف لكن الفحص أرجع خطأ: ${validation.error}`;
        response.validationStatus = 'failed';
      } else if (validation.error) {
        response.warning = `ℹ️ النموذج أُضيف بنجاح. ملاحظة: ${validation.error}`;
        response.validationStatus = 'warning';
      } else {
        response.validationStatus = 'ok';
      }

      return NextResponse.json(response);
    }

    return NextResponse.json({ error: 'يجب توفير endpointId أو hfModelId + category' }, { status: 400 });
  } catch (err) {
    console.error('[CustomModels] Create error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `خطأ في إنشاء النموذج المخصص: ${errMsg}` }, { status: 500 });
  }
}

// ─── PATCH: Fix existing custom models with wrong modelIds/baseUrls ──
export async function PATCH(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });

    const customModels = await db.customModel.findMany();
    let fixed = 0;

    for (const cm of customModels) {
      const updates: Record<string, any> = {};

      // Fix modelId if it's a short name
      const resolvedId = resolveHFModelId(cm.modelId);
      if (resolvedId && resolvedId !== cm.modelId) {
        updates.modelId = resolvedId;
        updates.nameEn = resolvedId;
      }

      // Fix NULL modelId for HF endpoints — assign default modelId
      if (!cm.modelId && (cm.provider === 'huggingface' || cm.baseUrl.includes('huggingface.co'))) {
        const defaultModelId = HF_DEFAULT_MODEL_IDS[cm.category];
        if (defaultModelId) {
          updates.modelId = defaultModelId;
          updates.nameEn = defaultModelId;
          console.log(`[PATCH] Fixed null modelId for ${cm.name} (${cm.category}) → ${defaultModelId}`);
        }
      }

      // Fix nameEn that's just the provider name (e.g. "huggingface" instead of a model ID)
      if (cm.nameEn === cm.provider && updates.modelId) {
        updates.nameEn = updates.modelId;
      }

      const effectiveModelId = updates.modelId || cm.modelId;

      // Fix baseUrl for HF inference models
      if (cm.apiFormat === 'hf-inference' && effectiveModelId) {
        const correctUrl = `https://api-inference.huggingface.co/models/${effectiveModelId}`;
        if (cm.baseUrl !== correctUrl && (
          cm.baseUrl.includes('router.huggingface.co') ||
          cm.baseUrl === 'https://api-inference.huggingface.co' ||
          !cm.baseUrl.includes('/models/')
        )) {
          updates.baseUrl = correctUrl;
        }
      }

      // Fix chat models to use openai format
      if (cm.apiFormat === 'hf-inference' && cm.category === 'chat') {
        updates.apiFormat = 'openai';
        updates.baseUrl = 'https://router.huggingface.co/v1';
      }

      if (Object.keys(updates).length > 0) {
        await db.customModel.update({ where: { id: cm.id }, data: updates });
        fixed++;
      }
    }

    return NextResponse.json({ message: `تم إصلاح ${fixed} نموذج من أصل ${customModels.length}`, fixed, total: customModels.length });
  } catch (err) {
    console.error('[CustomModels] Patch error:', err);
    return NextResponse.json({ error: 'خطأ في إصلاح النماذج' }, { status: 500 });
  }
}

// ─── DELETE: Remove a custom model ──────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'معرف النموذج مطلوب' }, { status: 400 });

    await db.customModel.delete({ where: { id } });
    return NextResponse.json({ message: 'تم حذف النموذج المخصص' });
  } catch (err) {
    console.error('[CustomModels] Delete error:', err);
    return NextResponse.json({ error: 'خطأ في حذف النموذج' }, { status: 500 });
  }
}
