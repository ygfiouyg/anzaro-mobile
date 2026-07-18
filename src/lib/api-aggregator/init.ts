// ═══════════════════════════════════════════════════════════
// مُهيّئ المُجمّع (Aggregator Initializer) — التهيئة والبذر
// ═══════════════════════════════════════════════════════════

import type { ApiCategory } from './types';
import { getKnownEndpoints } from './sources';
import { poolManager } from './pool-manager';
import { aggregationScheduler } from './scheduler';
import { db } from '@/lib/db';

/** هل تمت التهيئة؟ */
let initialized = false;

/**
 * التأكد من تهيئة المُجمّع
 * 1. بذر قاعدة البيانات بنقاط النهاية المعروفة (إذا كانت فارغة)
 * 2. تحديث المجموعة من قاعدة البيانات
 * 3. بدء التحديث التلقائي (كل 5 دقائق)
 * 4. تعيين علامة التهيئة
 */
export async function ensureAggregatorInitialized(): Promise<void> {
  if (initialized) return;

  console.log('[المُهيّئ] بدء تهيئة المُجمّع...');

  try {
    // ─── الخطوة 1: بذر نقاط النهاية المعروفة ───
    await seedKnownEndpoints();

    // ─── الخطوة 2: تحديث المجموعة من قاعدة البيانات ───
    await poolManager.refreshPool();

    // ─── الخطوة 3: بدء التحديث التلقائي (كل 5 دقائق) ───
    poolManager.startAutoRefresh();

    // ─── الخطوة 3.5: بدء المجدول (دورة كل 24 ساعة) ───
    // نتخطي الدورة الأولى لتجنب الضغط على الخادم عند التهيئة
    // المجدول سيعمل بعد مرور 24 ساعة من التهيئة
    try {
      aggregationScheduler.start(24 * 60 * 60 * 1000, true);
    } catch (err) {
      console.error('[المُهيّئ] خطأ في بدء المجدول:', err);
    }

    // ─── الخطوة 3.6: تنظيف سجلات التحقق القديمة ───
    await cleanupOldValidationLogs();

    // ─── الخطوة 4: تعيين علامة التهيئة ───
    initialized = true;

    const stats = poolManager.getStats();
    console.log(
      `[المُهيّئ] تمت التهيئة بنجاح — ${stats.availableEndpoints} نقطة نهاية متاحة في ${Object.keys(stats.byCategory).length} فئة`
    );
  } catch (error) {
    console.error('[المُهيّئ] خطأ في التهيئة:', error);
    throw error;
  }
}

/**
 * هل تمت تهيئة المُجمّع؟
 * @returns true إذا تمت التهيئة
 */
export function isAggregatorInitialized(): boolean {
  return initialized;
}

/**
 * بذر قاعدة البيانات بنقاط النهاية المعروفة
 * يتحقق مما إذا كانت قاعدة البيانات فارغة قبل الإضافة
 * النقاط التي تتطلب مصادقة بدون مفتاح API تُضاف كغير متاحة
 */
async function seedKnownEndpoints(): Promise<void> {
  try {
    // التحقق مما إذا كانت قاعدة البيانات فارغة
    const existingCount = await db.apiEndpoint.count();

    if (existingCount > 0) {
      console.log(
        `[المُهيّئ] توجد ${existingCount} نقطة نهاية بالفعل — تخطي البذر`
      );
      return;
    }

    const knownEndpoints = getKnownEndpoints();
    console.log(
      `[المُهيّئ] بذر ${knownEndpoints.length} نقطة نهاية معروفة...`
    );

    for (const ep of knownEndpoints) {
      try {
        // التحقق من الحاجة إلى مصادقة
        // هام: يجب أن يشمل النوع 'custom' أيضًا
        const requiresAuth =
          ep.authType === 'bearer' ||
          ep.authType === 'x-api-key' ||
          ep.authType === 'custom';

        // إذا كانت تتطلب مصادقة ولا يوجد مفتاح API
        const noApiKey = requiresAuth && !ep.apiKey;

        // إنشاء بيانات نقطة النهاية
        const metadata = noApiKey
          ? { noApiKey: true, reason: 'API key not configured' }
          : ep.metadata ?? {};

        await db.apiEndpoint.create({
          data: {
            name: ep.name,
            provider: ep.provider,
            category: ep.category,
            baseUrl: ep.baseUrl,
            modelId: ep.modelId ?? null,
            apiKey: ep.apiKey ?? null,
            authType: ep.authType,
            authHeader: ep.authHeader ?? null,
            apiFormat: ep.apiFormat,
            sourceRepo: ep.sourceRepo ?? null,
            sourceUrl: ep.sourceUrl ?? null,
            isFree: ep.isFree,
            // تعطيل نقطة النهاية إذا لم يكن هناك مفتاح API
            isAvailable: !noApiKey,
            priority: ep.priority ?? 50,
            capabilities: ep.capabilities
              ? JSON.stringify(ep.capabilities)
              : null,
            metadata: JSON.stringify(metadata),
          },
        });
      } catch (err) {
        console.error(`[المُهيّئ] خطأ في بذر ${ep.name}:`, err);
      }
    }

    const newCount = await db.apiEndpoint.count();
    console.log(
      `[المُهيّئ] تم البذر — ${newCount} نقطة نهاية في قاعدة البيانات`
    );
  } catch (error) {
    console.error('[المُهيّئ] خطأ في بذر نقاط النهاية:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// دوال الإبلاغ للاستخدام من مسارات chat/image/video
// ═══════════════════════════════════════════════════════════

/**
 * الإبلاغ عن نجاح نقطة نهاية
 * يبحث عن نقطة النهاية بناءً على المزوّد والفئة ويُحدّث إحصائياتها
 *
 * @param provider - اسم المزوّد
 * @param category - فئة API
 * @param responseMs - وقت الاستجابة بالمللي ثانية
 */
export async function reportEndpointSuccess(
  provider: string,
  category: ApiCategory,
  responseMs: number
): Promise<void> {
  try {
    // البحث عن نقطة النهاية في قاعدة البيانات
    const endpoint = await db.apiEndpoint.findFirst({
      where: { provider, category, isAvailable: true },
      orderBy: { priority: 'desc' },
    });

    if (!endpoint) return;

    await poolManager.markSuccess(endpoint.id, responseMs);
  } catch (error) {
    // تسجيل الخطأ صامتًا — لا ينبغي أن يوقف عملية المستخدم
    console.error('[المُهيّئ] خطأ في الإبلاغ عن النجاح:', error);
  }
}

/**
 * الإبلاغ عن فشل نقطة نهاية
 * يبحث عن نقطة النهاية بناءً على المزوّد والفئة ويُحدّث إحصائياتها
 *
 * @param provider - اسم المزوّد
 * @param category - فئة API
 * @param error - رسالة الخطأ
 */
export async function reportEndpointFailure(
  provider: string,
  category: ApiCategory,
  error: string
): Promise<void> {
  try {
    // البحث عن نقطة النهاية في قاعدة البيانات
    const endpoint = await db.apiEndpoint.findFirst({
      where: { provider, category, isAvailable: true },
      orderBy: { priority: 'desc' },
    });

    if (!endpoint) return;

    await poolManager.markFailed(endpoint.id, error);
  } catch (err) {
    // تسجيل الخطأ صامتًا — لا ينبغي أن يوقف عملية المستخدم
    console.error('[المُهيّئ] خطأ في الإبلاغ عن الفشل:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// تنظيف سجلات التحقق القديمة
// ═══════════════════════════════════════════════════════════

/** أقصى عمر لسجلات التحقق (30 يوم) */
const MAX_LOG_AGE_DAYS = 30;

/** أقصى عدد سجلات لكل نقطة نهاية (أحدث 50 فقط) */
const MAX_LOGS_PER_ENDPOINT = 50;

/**
 * تنظيف سجلات التحقق القديمة
 * - يحذف السجلات الأقدم من 30 يوم
 * - يحدّد عدد السجلات لكل نقطة نهاية إلى 50 كحد أقصى
 */
async function cleanupOldValidationLogs(): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_LOG_AGE_DAYS);

    // حذف السجلات الأقدم من 30 يوم
    const deletedOld = await db.apiValidationLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    if (deletedOld.count > 0) {
      console.log(`[المُهيّئ] تم حذف ${deletedOld.count} سجل تحقق أقدم من ${MAX_LOG_AGE_DAYS} يوم`);
    }

    // تحديد السجلات لكل نقطة نهاية (أحدث 50 فقط)
    const endpointIds = await db.apiEndpoint.findMany({
      select: { id: true },
    });

    let totalTrimmed = 0;
    for (const ep of endpointIds) {
      const logCount = await db.apiValidationLog.count({
        where: { endpointId: ep.id },
      });

      if (logCount > MAX_LOGS_PER_ENDPOINT) {
        // احصل على معرفات السجلات التي يجب الاحتفاظ بها
        const keepIds = await db.apiValidationLog.findMany({
          where: { endpointId: ep.id },
          orderBy: { createdAt: 'desc' },
          take: MAX_LOGS_PER_ENDPOINT,
          select: { id: true },
        });

        const keepIdSet = new Set(keepIds.map((l) => l.id));

        const deleted = await db.apiValidationLog.deleteMany({
          where: {
            endpointId: ep.id,
            id: { notIn: [...keepIdSet] },
          },
        });

        totalTrimmed += deleted.count;
      }
    }

    if (totalTrimmed > 0) {
      console.log(`[المُهيّئ] تم تقليم ${totalTrimmed} سجل تحقق زائد`);
    }
  } catch (error) {
    console.error('[المُهيّئ] خطأ في تنظيف سجلات التحقق:', error);
  }
}
