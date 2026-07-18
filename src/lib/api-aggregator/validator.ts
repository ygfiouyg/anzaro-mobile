// ═══════════════════════════════════════════════════════════
// مُحقّق نقاط النهاية (Endpoint Validator) — التحقق من صلاحية نقاط API
// ═══════════════════════════════════════════════════════════

import type { ValidationStatus, ValidationResult } from './types';
import { db } from '@/lib/db';

/** مهلة التحقق بالمللي ثانية */
const VALIDATION_TIMEOUT_MS = 15_000;

/** أقصى عدد من التحققات المتوازية */
const MAX_CONCURRENT_VALIDATIONS = 5;

/**
 * بناء ترويسات المصادقة بناءً على نوع المصادقة
 * @param authType - نوع المصادقة
 * @param apiKey - مفتاح API
 * @param authHeader - اسم الترويسة المخصصة (للنوع custom)
 * @returns كائن الترويسات
 */
function buildAuthHeaders(
  authType: string,
  apiKey?: string | null,
  authHeader?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!apiKey) return headers;

  switch (authType) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'x-api-key':
      headers['x-api-key'] = apiKey;
      break;
    case 'custom':
      if (authHeader) {
        headers[authHeader] = apiKey;
      }
      break;
    // 'none' — لا ترويسات مصادقة إضافية
  }

  return headers;
}

/**
 * التحقق من نقطة نهاية واحدة
 * يُجري طلبًا تجريبيًا حسب فئة API ويُسجّل النتيجة
 * **هام**: هذه الدالة تستدعي saveValidationLog و updateEndpointStats داخليًا
 * لا يحتاج المُستدعي إلى تكرار كتابة السجلات
 *
 * @param endpoint - سجل نقطة النهاية من قاعدة البيانات
 * @returns نتيجة التحقق
 */
export async function validateEndpoint(endpoint: {
  id: string;
  category: string;
  baseUrl: string;
  modelId?: string | null;
  apiKey?: string | null;
  authType: string;
  authHeader?: string | null;
  apiFormat: string;
}): Promise<ValidationResult> {
  const startTime = Date.now();
  let status: ValidationStatus = 'fail';
  let statusCode: number | undefined;
  let errorMessage: string | undefined;

  try {
    const headers = buildAuthHeaders(endpoint.authType, endpoint.apiKey, endpoint.authHeader);
    let url: string;
    let options: RequestInit;

    switch (endpoint.category) {
      // ─── التحقق من نقاط المحادثة ───
      case 'chat': {
        if (endpoint.apiFormat === 'gemini') {
          // تنسيق Gemini الأصلي
          const model = endpoint.modelId || 'gemini-2.0-flash';
          const key = endpoint.apiKey || '';
          url = `${endpoint.baseUrl}/models/${model}:generateContent?key=${key}`;
          options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Hi' }] }],
              generationConfig: { maxOutputTokens: 1 },
            }),
            signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
          };
        } else {
          // تنسيق OpenAI القياسي
          url = `${endpoint.baseUrl}/chat/completions`;
          options = {
            method: 'POST',
            headers,
            body: JSON.stringify({
              max_tokens: 1,
              messages: [{ role: 'user', content: 'Hi' }],
              ...(endpoint.modelId ? { model: endpoint.modelId } : {}),
            }),
            signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
          };
        }
        break;
      }

      // ─── التحقق من نقاط الصور ───
      case 'image': {
        if (endpoint.apiFormat === 'pollinations') {
          // Pollinations: طلب GET مباشر لصورة صغيرة
          url = `${endpoint.baseUrl}test?width=64&height=64`;
          options = {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
          };
        } else if (endpoint.apiFormat === 'hf-inference') {
          // HuggingFace Inference API — use baseUrl directly if it's model-specific
          // or construct the correct URL from modelId
          if (endpoint.baseUrl.includes('/models/')) {
            // baseUrl already contains the model path (e.g., https://api-inference.huggingface.co/models/xxx)
            url = endpoint.baseUrl;
          } else if (endpoint.modelId) {
            // Construct from modelId
            url = `https://api-inference.huggingface.co/models/${endpoint.modelId}`;
          } else {
            url = `https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0`;
          }
          options = {
            method: 'POST',
            headers,
            body: JSON.stringify({ inputs: 'a small test image' }),
            signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
          };
        } else {
          // تنسيق OpenAI لتوليد الصور
          url = `${endpoint.baseUrl}/images/generations`;
          options = {
            method: 'POST',
            headers,
            body: JSON.stringify({
              prompt: 'test',
              size: '256x256',
              n: 1,
              ...(endpoint.modelId ? { model: endpoint.modelId } : {}),
            }),
            signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
          };
        }
        break;
      }

      // ─── التحقق من نقاط الفيديو والتعرف على الكلام ───
      case 'video':
      case 'asr': {
        // طلب HEAD بسيط للتحقق من أن الخدمة تعمل
        url = endpoint.baseUrl;
        options = {
          method: 'HEAD',
          signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
        };
        break;
      }

      // ─── التحقق من نقاط الترجمة ───
      case 'translation': {
        // استخدام نقطة المحادثة مع طلب ترجمة
        url = `${endpoint.baseUrl}/chat/completions`;
        options = {
          method: 'POST',
          headers,
          body: JSON.stringify({
            max_tokens: 10,
            messages: [
              { role: 'system', content: 'You are a translator. Translate the given text.' },
              { role: 'user', content: 'Translate to English: مرحبا' },
            ],
            ...(endpoint.modelId ? { model: endpoint.modelId } : {}),
          }),
          signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
        };
        break;
      }

      // ─── فئة غير معروفة ───
      default: {
        url = endpoint.baseUrl;
        options = {
          method: 'HEAD',
          signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
        };
      }
    }

    const response = await fetch(url, options);
    statusCode = response.status;

    // اعتبار الحالة ناجحة إذا كانت الاستجابة 2xx
    if (response.ok) {
      status = 'success';
    } else if (response.status === 429) {
      status = 'rate_limited';
      errorMessage = `حد المعدل: ${response.status}`;
    } else {
      status = 'fail';
      try {
        errorMessage = await response.text();
        // اقتطاع رسالة الخطأ الطويلة
        if (errorMessage.length > 500) {
          errorMessage = errorMessage.substring(0, 500) + '...';
        }
      } catch {
        errorMessage = `خطأ HTTP: ${response.status}`;
      }
    }
  } catch (error) {
    // التحقق من نوع الخطأ
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      status = 'timeout';
      errorMessage = 'انتهت مهلة الطلب';
    } else if (error instanceof Error) {
      status = 'fail';
      errorMessage = error.message;
    } else {
      status = 'fail';
      errorMessage = 'خطأ غير معروف';
    }
  }

  const responseMs = Date.now() - startTime;

  const result: ValidationResult = {
    endpointId: endpoint.id,
    status,
    responseMs,
    statusCode,
    errorMessage,
  };

  // ─── حفظ سجل التحقق وتحديث إحصائيات نقطة النهاية ───
  // هام: يتم ذلك داخليًا — لا يحتاج المُستدعي إلى تكرار ذلك
  await saveValidationLog(result);
  await updateEndpointStats(endpoint.id, result);

  return result;
}

/**
 * حفظ سجل التحقق في قاعدة البيانات
 * @param result - نتيجة التحقق
 */
async function saveValidationLog(result: ValidationResult): Promise<void> {
  try {
    await db.apiValidationLog.create({
      data: {
        endpointId: result.endpointId,
        status: result.status,
        responseMs: result.responseMs,
        statusCode: result.statusCode,
        errorMessage: result.errorMessage,
      },
    });
  } catch (error) {
    // تسجيل الخطأ صامتًا — لا ينبغي أن يوقف عملية التحقق
    console.error('[المُحقّق] خطأ في حفظ سجل التحقق:', error);
  }
}

/**
 * تحديث إحصائيات نقطة النهاية بناءً على نتيجة التحقق
 * يعيد حساب معدل النجاح من جميع سجلات التحقق
 * ويُحدّث عدد الإخفاقات المتتالية ومتوسط وقت الاستجابة
 * ويُعطّل نقطة النهاية بعد 3 إخفاقات متتالية
 *
 * @param endpointId - معرف نقطة النهاية
 * @param result - نتيجة التحقق الأخيرة
 */
async function updateEndpointStats(
  endpointId: string,
  result: ValidationResult
): Promise<void> {
  try {
    // جلب جميع سجلات التحقق لحساب معدل النجاح
    const allLogs = await db.apiValidationLog.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: 100, // آخر 100 سجل فقط
    });

    const successCount = allLogs.filter((log) => log.status === 'success').length;
    const successRate = allLogs.length > 0 ? (successCount / allLogs.length) * 100 : 0;

    // حساب متوسط وقت الاستجابة (مرجح — الأحدث أهم)
    const responseTimes = allLogs
      .filter((log) => log.status === 'success')
      .map((log) => log.responseMs);
    const avgResponseMs =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, ms) => sum + ms, 0) / responseTimes.length
        : 0;

    // حساب الإخفاقات المتتالية
    const currentEndpoint = await db.apiEndpoint.findUnique({
      where: { id: endpointId },
    });

    if (!currentEndpoint) return;

    const consecutiveFails =
      result.status === 'success'
        ? 0
        : currentEndpoint.consecutiveFails + 1;

    // تعطيل نقطة النهاية بعد 3 إخفاقات متتالية
    const isAvailable = consecutiveFails < 3 ? currentEndpoint.isAvailable : false;

    await db.apiEndpoint.update({
      where: { id: endpointId },
      data: {
        successRate,
        avgResponseMs,
        consecutiveFails,
        lastValidatedAt: new Date(),
        lastError: result.errorMessage,
        isAvailable,
      },
    });
  } catch (error) {
    console.error('[المُحقّق] خطأ في تحديث إحصائيات نقطة النهاية:', error);
  }
}

/**
 * التحقق من جميع نقاط النهاية المتاحة على دفعات
 * يُعالج MAX_CONCURRENT_VALIDATIONS نقاط في وقت واحد
 *
 * @returns قائمة نتائج التحقق
 */
export async function validateAllEndpoints(): Promise<ValidationResult[]> {
  // جلب جميع نقاط النهاية المتاحة
  const endpoints = await db.apiEndpoint.findMany({
    where: { isAvailable: true },
  });

  const results: ValidationResult[] = [];

  // معالجة على دفعات
  for (let i = 0; i < endpoints.length; i += MAX_CONCURRENT_VALIDATIONS) {
    const batch = endpoints.slice(i, i + MAX_CONCURRENT_VALIDATIONS);
    const batchResults = await Promise.all(
      batch.map((endpoint) => validateEndpoint(endpoint))
    );
    results.push(...batchResults);
  }

  return results;
}
