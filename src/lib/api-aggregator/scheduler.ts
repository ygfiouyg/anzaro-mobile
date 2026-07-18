// ═══════════════════════════════════════════════════════════
// مُجدول التجميع (Aggregation Scheduler) — جدولة دورات الاستخراج والتحقق
// ═══════════════════════════════════════════════════════════

import type { AggregationResult, JobType, SchedulerStatus } from './types';
import { getKnownEndpoints, getGitHubSources, scrapeGitHubRepo, scrapeHuggingFaceModels } from './sources';
import { validateAllEndpoints } from './validator';
import { poolManager } from './pool-manager';
import { db } from '@/lib/db';

/** الفترة الافتراضية بين دورات التجميع الكاملة (24 ساعة) */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** حد الإخفاقات المتتالية للإزالة */
const REMOVAL_THRESHOLD = 3;

/**
 * مُجدول التجميع — Singleton
 * يُدير دورات الاستخراج والتحقق الدورية
 * ويُنسّق بين استخراج المصادر والتحقق من نقاط النهاية وتحديث المجموعة
 */
class AggregationScheduler {
  /** هل المجدول يعمل؟ */
  private running = false;

  /** معرّف مؤقت الجدولة */
  private timer: ReturnType<typeof setInterval> | null = null;

  /** فترة الجدولة بالمللي ثانية */
  private intervalMs = DEFAULT_INTERVAL_MS;

  /** وقت آخر تشغيل */
  private lastRun: Date | null = null;

  /** نتيجة آخر تشغيل */
  private lastResult: AggregationResult | null = null;

  // ─── Singleton ───
  private static instance: AggregationScheduler | null = null;

  private constructor() {}

  /** الحصول على النسخة الوحيدة من المُجدول */
  static getInstance(): AggregationScheduler {
    if (!AggregationScheduler.instance) {
      AggregationScheduler.instance = new AggregationScheduler();
    }
    return AggregationScheduler.instance;
  }

  /**
   * بدء المُجدول
   * @param intervalMs - فترة الجدولة بالمللي ثانية (افتراضي: 24 ساعة)
   * @param skipFirstRun - تخطي الدورة الأولى (افتراضي: false)
   *                       استخدم true عند التهيئة لتجنب الضغط على الخادم
   */
  start(intervalMs?: number, skipFirstRun = false): void {
    if (this.running) {
      console.log('[المُجدول] يعمل بالفعل');
      return;
    }

    this.intervalMs = intervalMs ?? DEFAULT_INTERVAL_MS;
    this.running = true;

    if (!skipFirstRun) {
      // تشغيل دورة أولى فورًا
      this.runFullCycle().catch((err) => {
        console.error('[المُجدول] خطأ في الدورة الأولى:', err);
      });
    }

    // جدولة الدورات اللاحقة
    this.timer = setInterval(() => {
      this.runFullCycle().catch((err) => {
        console.error('[المُجدول] خطأ في الدورة المجدولة:', err);
      });
    }, this.intervalMs);

    console.log(
      `[المُجدول] تم البدء — دورة كل ${this.intervalMs / 1000 / 60} دقيقة${skipFirstRun ? ' (بدون دورة أولى)' : ''}`
    );
  }

  /**
   * إيقاف المُجدول
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log('[المُجدول] تم الإيقاف');
  }

  /**
   * تنفيذ دورة تجميع كاملة:
   * 1. استخراج نقاط النهاية من المصادر
   * 2. التحقق من نقاط النهاية
   * 3. إضافة نقاط جديدة
   * 4. إزالة النقاط المعطّلة
   * 5. تحديث المجموعة
   *
   * @param existingJobId - معرف وظيفة موجودة (إن وُجدت) لتجنب إنشاء وظيفة مكررة
   * @returns نتيجة الدورة
   */
  async runFullCycle(existingJobId?: string): Promise<AggregationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let sourcesScraped = 0;
    let endpointsFound = 0;
    let endpointsValidated = 0;
    let endpointsAdded = 0;
    let endpointsRemoved = 0;

    console.log('[المُجدول] بدء دورة التجميع الكاملة...');

    // استخدام معرف الوظيفة الموجود أو إنشاء جديد
    const jobId = existingJobId ?? await createJob('full_cycle');

    try {
      await updateJobStatus(jobId, 'running');

      // ─── الخطوة 1: استخراج نقاط النهاية من المصادر ───
      try {
        // استخراج من مصادر GitHub
        const gitHubSources = getGitHubSources();
        for (const source of gitHubSources) {
          try {
            const scraped = await scrapeGitHubRepo(source.repo);
            sourcesScraped++;
            endpointsFound += scraped.endpointsFound;
            if (scraped.errors.length > 0) {
              errors.push(...scraped.errors);
            }
            // إضافة نقاط النهاية المُكتشفة من GitHub إلى المجموعة
            for (const ep of scraped.discoveredEndpoints) {
              try {
                const id = await poolManager.addEndpoint(ep);
                if (id) endpointsAdded++;
              } catch (err) {
                errors.push(`خطأ في إضافة ${ep.name}: ${err}`);
              }
            }
          } catch (err) {
            errors.push(`خطأ في استخراج ${source.repo}: ${err}`);
          }
        }

        // إضافة نقاط النهاية المعروفة
        const knownEndpoints = getKnownEndpoints();
        endpointsFound += knownEndpoints.length;

        for (const ep of knownEndpoints) {
          try {
            const id = await poolManager.addEndpoint(ep);
            if (id) endpointsAdded++;
          } catch (err) {
            errors.push(`خطأ في إضافة ${ep.name}: ${err}`);
          }
        }

        // ─── استخراج نماذج HuggingFace ───
        try {
          const hfResult = await scrapeHuggingFaceModels();
          endpointsFound += hfResult.endpointsFound;
          if (hfResult.errors.length > 0) {
            errors.push(...hfResult.errors);
          }
          for (const ep of hfResult.discoveredEndpoints) {
            try {
              const id = await poolManager.addEndpoint(ep);
              if (id) endpointsAdded++;
            } catch (err) {
              errors.push(`خطأ في إضافة ${ep.name}: ${err}`);
            }
          }
          sourcesScraped++; // احتساب HF كمصدر
        } catch (err) {
          errors.push(`خطأ في استخراج نماذج HuggingFace: ${err}`);
        }
      } catch (err) {
        errors.push(`خطأ في الاستخراج: ${err}`);
      }

      // ─── الخطوة 2: التحقق من نقاط النهاية ───
      try {
        const validationResults = await validateAllEndpoints();
        endpointsValidated = validationResults.length;
      } catch (err) {
        errors.push(`خطأ في التحقق: ${err}`);
      }

      // ─── الخطوة 3: إزالة النقاط المعطّلة ───
      try {
        const failedEndpoints = await db.apiEndpoint.findMany({
          where: {
            consecutiveFails: { gte: REMOVAL_THRESHOLD },
            isAvailable: false,
          },
        });

        for (const ep of failedEndpoints) {
          try {
            await poolManager.removeEndpoint(ep.id);
            endpointsRemoved++;
          } catch (err) {
            errors.push(`خطأ في إزالة ${ep.name}: ${err}`);
          }
        }
      } catch (err) {
        errors.push(`خطأ في إزالة النقاط المعطّلة: ${err}`);
      }

      // ─── الخطوة 4: تحديث المجموعة ───
      try {
        await poolManager.refreshPool();
      } catch (err) {
        errors.push(`خطأ في تحديث المجموعة: ${err}`);
      }
    } catch (err) {
      errors.push(`خطأ عام في الدورة: ${err}`);
    }

    const duration = Date.now() - startTime;

    const result: AggregationResult = {
      sourcesScraped,
      endpointsFound,
      endpointsValidated,
      endpointsAdded,
      endpointsRemoved,
      errors,
      duration,
    };

    this.lastRun = new Date();
    this.lastResult = result;

    // إكمال سجل الوظيفة
    await completeJob(jobId, result);

    console.log(
      `[المُجدول] اكتملت الدورة: ${endpointsAdded} مضافة، ${endpointsRemoved} محذوفة، ${errors.length} أخطاء، ${duration}مللي ثانية`
    );

    return result;
  }

  /**
   * تنفيذ استخراج فقط (بدون تحقق)
   * @param existingJobId - معرف وظيفة موجودة (إن وُجدت) لتجنب إنشاء وظيفة مكررة
   * @returns نتيجة الاستخراج
   */
  async runScrapeOnly(existingJobId?: string): Promise<AggregationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let endpointsFound = 0;
    let endpointsAdded = 0;

    const jobId = existingJobId ?? await createJob('scrape');

    try {
      await updateJobStatus(jobId, 'running');

      // استخراج من مصادر GitHub
      const gitHubSources = getGitHubSources();
      let sourcesScraped = 0;

      for (const source of gitHubSources) {
        try {
          const scraped = await scrapeGitHubRepo(source.repo);
          sourcesScraped++;
          endpointsFound += scraped.endpointsFound;
          if (scraped.errors.length > 0) {
            errors.push(...scraped.errors);
          }
          // إضافة نقاط النهاية المُكتشفة من GitHub إلى المجموعة
          for (const ep of scraped.discoveredEndpoints) {
            try {
              const id = await poolManager.addEndpoint(ep);
              if (id) endpointsAdded++;
            } catch (err) {
              errors.push(`خطأ في إضافة ${ep.name}: ${err}`);
            }
          }
        } catch (err) {
          errors.push(`خطأ في استخراج ${source.repo}: ${err}`);
        }
      }

      // إضافة نقاط النهاية المعروفة
      const knownEndpoints = getKnownEndpoints();
      endpointsFound += knownEndpoints.length;

      for (const ep of knownEndpoints) {
        try {
          const id = await poolManager.addEndpoint(ep);
          if (id) endpointsAdded++;
        } catch (err) {
          errors.push(`خطأ في إضافة ${ep.name}: ${err}`);
        }
      }

      // ─── استخراج نماذج HuggingFace ───
      try {
        const hfResult = await scrapeHuggingFaceModels();
        endpointsFound += hfResult.endpointsFound;
        if (hfResult.errors.length > 0) {
          errors.push(...hfResult.errors);
        }
        for (const ep of hfResult.discoveredEndpoints) {
          try {
            const id = await poolManager.addEndpoint(ep);
            if (id) endpointsAdded++;
          } catch (err) {
            errors.push(`خطأ في إضافة ${ep.name}: ${err}`);
          }
        }
        sourcesScraped++; // احتساب HF كمصدر
      } catch (err) {
        errors.push(`خطأ في استخراج نماذج HuggingFace: ${err}`);
      }

      const duration = Date.now() - startTime;

      const result: AggregationResult = {
        sourcesScraped,
        endpointsFound,
        endpointsValidated: 0,
        endpointsAdded,
        endpointsRemoved: 0,
        errors,
        duration,
      };

      await completeJob(jobId, result);
      return result;
    } catch (err) {
      errors.push(`خطأ عام في الاستخراج: ${err}`);
      const duration = Date.now() - startTime;
      const result: AggregationResult = {
        sourcesScraped: 0,
        endpointsFound: 0,
        endpointsValidated: 0,
        endpointsAdded: 0,
        endpointsRemoved: 0,
        errors,
        duration,
      };
      await completeJob(jobId, result);
      return result;
    }
  }

  /**
   * تنفيذ تحقق فقط (بدون استخراج)
   * @param existingJobId - معرف وظيفة موجودة (إن وُجدت) لتجنب إنشاء وظيفة مكررة
   * @returns نتيجة التحقق
   */
  async runValidateOnly(existingJobId?: string): Promise<AggregationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let endpointsValidated = 0;
    let endpointsRemoved = 0;

    const jobId = existingJobId ?? await createJob('validate');

    try {
      await updateJobStatus(jobId, 'running');

      // التحقق من جميع نقاط النهاية
      const validationResults = await validateAllEndpoints();
      endpointsValidated = validationResults.length;

      // إزالة النقاط المعطّلة
      const failedEndpoints = await db.apiEndpoint.findMany({
        where: {
          consecutiveFails: { gte: REMOVAL_THRESHOLD },
          isAvailable: false,
        },
      });

      for (const ep of failedEndpoints) {
        try {
          await poolManager.removeEndpoint(ep.id);
          endpointsRemoved++;
        } catch (err) {
          errors.push(`خطأ في إزالة ${ep.name}: ${err}`);
        }
      }

      // تحديث المجموعة
      await poolManager.refreshPool();
    } catch (err) {
      errors.push(`خطأ عام في التحقق: ${err}`);
    }

    const duration = Date.now() - startTime;

    const result: AggregationResult = {
      sourcesScraped: 0,
      endpointsFound: 0,
      endpointsValidated,
      endpointsAdded: 0,
      endpointsRemoved,
      errors,
      duration,
    };

    await completeJob(jobId, result);
    return result;
  }

  /**
   * تشغيل وظيفة محددة بنوعها (يُستخدم من مسار API)
   * **مهم**: يتم تمرير معرف الوظيفة الموجودة لتجنب إنشاء وظيفة مكررة
   * @param jobId - معرف الوظيفة المُنشأة من مسار API
   * @param type - نوع الوظيفة
   */
  async triggerJob(jobId: string, type: JobType): Promise<AggregationResult> {
    // تحديث حالة الوظيفة إلى "قيد التشغيل"
    await updateJobStatus(jobId, 'running');

    let result: AggregationResult;

    switch (type) {
      case 'scrape':
        result = await this.runScrapeOnly(jobId);
        break;
      case 'validate':
        result = await this.runValidateOnly(jobId);
        break;
      case 'full_cycle':
      default:
        result = await this.runFullCycle(jobId);
        break;
    }

    return result;
  }

  /**
   * الحصول على حالة المُجدول
   * @returns حالة المُجدول الحالية
   */
  getStatus(): SchedulerStatus {
    let nextRun: string | null = null;

    if (this.running && this.lastRun) {
      const nextRunDate = new Date(this.lastRun.getTime() + this.intervalMs);
      nextRun = nextRunDate.toISOString();
    }

    return {
      isRunning: this.running,
      lastRun: this.lastRun?.toISOString() ?? null,
      nextRun,
      intervalMs: this.intervalMs,
      lastResult: this.lastResult,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// دوال مساعدة لإدارة سجلات الوظائف
// ═══════════════════════════════════════════════════════════

/**
 * إنشاء سجل وظيفة جديدة في قاعدة البيانات
 * @param type - نوع الوظيفة
 * @returns معرف الوظيفة
 */
async function createJob(type: JobType): Promise<string> {
  const job = await db.apiAggregationJob.create({
    data: {
      type,
      status: 'pending',
      startedAt: new Date(),
    },
  });
  return job.id;
}

/**
 * تحديث حالة وظيفة
 * @param jobId - معرف الوظيفة
 * @param status - الحالة الجديدة
 */
async function updateJobStatus(
  jobId: string,
  status: 'pending' | 'running' | 'completed' | 'failed'
): Promise<void> {
  await db.apiAggregationJob.update({
    where: { id: jobId },
    data: { status, updatedAt: new Date() },
  });
}

/**
 * إكمال وظيفة وحفظ نتائجها
 *
 * **تصحيح خطأ مهم**: حالة الوظيفة تعتمد على نجاح الدورة بشكل كامل
 * - إذا لم تُضف أي نقاط ولم تُحقق أي نجاح → 'failed'
 * - إذا أضافت أو تحققت من نقاط (حتى مع بعض الأخطاء) → 'completed'
 * - إذا كانت كلها أخطاء بدون أي نجاح → 'failed'
 *
 * @param jobId - معرف الوظيفة
 * @param result - نتيجة الدورة
 */
async function completeJob(
  jobId: string,
  result: AggregationResult
): Promise<void> {
  // تحديد الحالة: completed إذا كان هناك تقدم حقيقي، failed فقط إذا فشل كل شيء
  const hasProgress = result.endpointsAdded > 0 || result.endpointsValidated > 0 || result.sourcesScraped > 0;
  const hasOnlyErrors = result.errors.length > 0 && !hasProgress;

  await db.apiAggregationJob.update({
    where: { id: jobId },
    data: {
      status: hasOnlyErrors ? 'failed' : 'completed',
      sourcesScraped: result.sourcesScraped,
      endpointsFound: result.endpointsFound,
      endpointsValidated: result.endpointsValidated,
      endpointsAdded: result.endpointsAdded,
      endpointsRemoved: result.endpointsRemoved,
      errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      duration: result.duration,
      completedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/** تصدير النسخة الوحيدة من المُجدول */
export const aggregationScheduler = AggregationScheduler.getInstance();
