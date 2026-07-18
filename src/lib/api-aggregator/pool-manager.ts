// ═══════════════════════════════════════════════════════════
// مدير المجموعة (Pool Manager) — إدارة نقاط النهاية في الذاكرة
// ═══════════════════════════════════════════════════════════

import type { ApiCategory, DiscoveredEndpoint, PoolStats } from './types';
import { db } from '@/lib/db';

/** فترة التحديث التلقائي بالمللي ثانية (5 دقائق) */
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** أولوية قصوى */
const MAX_PRIORITY = 100;

/** حد الإخفاقات المتتالية قبل التعطيل */
const MAX_CONSECUTIVE_FAILS = 3;

/**
 * مدير مجموعة نقاط النهاية — Singleton
 * يُحافظ على مجموعة نقاط النهاية في الذاكرة مصنّفة حسب الفئة
 * ويُوفّر واجهة سريعة للوصول إلى أفضل نقطة نهاية متاحة
 */
class PoolManager {
  /** مجموعة نقاط النهاية مصنّفة حسب الفئة */
  private pool: Map<ApiCategory, DiscoveredEndpoint[]> = new Map();

  /** خريطة معرفات نقاط النهاية في الذاكرة (baseUrl+modelId → id) */
  private endpointIdMap: Map<string, string> = new Map();

  /** معرّف مؤقت التحديث التلقائي */
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** وقت آخر تحديث */
  private lastUpdate: Date | null = null;

  /** هل المجموعة تم تحميلها؟ */
  private loaded = false;

  // ─── Singleton ───
  private static instance: PoolManager | null = null;

  private constructor() {}

  /** الحصول على النسخة الوحيدة من مدير المجموعة */
  static getInstance(): PoolManager {
    if (!PoolManager.instance) {
      PoolManager.instance = new PoolManager();
    }
    return PoolManager.instance;
  }

  /**
   * تحديث المجموعة من قاعدة البيانات
   * يحمّل جميع نقاط النهاية المتاحة ويُصنّفها حسب الفئة
   */
  async refreshPool(): Promise<void> {
    try {
      const endpoints = await db.apiEndpoint.findMany({
        where: { isAvailable: true },
        orderBy: { priority: 'desc' },
      });

      // إعادة بناء المجموعة
      const newPool = new Map<ApiCategory, DiscoveredEndpoint[]>();

      for (const ep of endpoints) {
        const category = ep.category as ApiCategory;
        if (!newPool.has(category)) {
          newPool.set(category, []);
        }
        const discoveredEp: DiscoveredEndpoint & { _dbId: string } = {
          name: ep.name,
          provider: ep.provider,
          category,
          baseUrl: ep.baseUrl,
          modelId: ep.modelId ?? undefined,
          apiKey: ep.apiKey ?? undefined,
          authType: ep.authType as DiscoveredEndpoint['authType'],
          authHeader: ep.authHeader ?? undefined,
          apiFormat: ep.apiFormat as DiscoveredEndpoint['apiFormat'],
          sourceRepo: ep.sourceRepo ?? undefined,
          sourceUrl: ep.sourceUrl ?? undefined,
          isFree: ep.isFree,
          priority: ep.priority,
          capabilities: ep.capabilities ? JSON.parse(ep.capabilities) : undefined,
          metadata: ep.metadata ? JSON.parse(ep.metadata) : undefined,
          _dbId: ep.id,
        };
        newPool.get(category)!.push(discoveredEp);

        // تخزين معرف قاعدة البيانات للوصول إليه لاحقًا
        const key = `${ep.baseUrl}::${ep.modelId ?? ''}`;
        this.endpointIdMap.set(key, ep.id);
      }

      this.pool = newPool;
      this.lastUpdate = new Date();
      this.loaded = true;

      // تسجيل حالة المجموعة
      const totalEndpoints = endpoints.length;
      const categories = [...newPool.keys()];
      console.log(
        `[مدير المجموعة] تم التحديث: ${totalEndpoints} نقطة نهاية في ${categories.length} فئة`
      );
    } catch (error) {
      console.error('[مدير المجموعة] خطأ في تحديث المجموعة:', error);
    }
  }

  /**
   * الحصول على نقاط النهاية لفئة معينة مرتّبة حسب الأولوية
   * @param category - فئة API
   * @returns قائمة نقاط النهاية المرتّبة
   */
  getEndpoints(category: ApiCategory): DiscoveredEndpoint[] {
    const endpoints = this.pool.get(category) ?? [];
    // ترتيب حسب الأولوية (تنازلي)
    return [...endpoints].sort(
      (a, b) => (b.priority ?? 50) - (a.priority ?? 50)
    );
  }

  /**
   * الحصول على أفضل نقطة نهاية متاحة لفئة معينة
   * @param category - فئة API
   * @returns أفضل نقطة نهاية أو undefined
   */
  getBestEndpoint(category: ApiCategory): DiscoveredEndpoint | undefined {
    const endpoints = this.getEndpoints(category);
    return endpoints[0];
  }

  /**
   * إضافة نقطة نهاية جديدة إلى قاعدة البيانات والمجموعة
   * @param endpoint - بيانات نقطة النهاية المُكتشفة
   * @returns معرف نقطة النهاية المُنشأة
   */
  async addEndpoint(endpoint: DiscoveredEndpoint): Promise<string> {
    try {
      // التحقق من عدم وجود نقطة نهاية مكررة
      const existing = await db.apiEndpoint.findFirst({
        where: {
          provider: endpoint.provider,
          category: endpoint.category,
          baseUrl: endpoint.baseUrl,
          modelId: endpoint.modelId ?? null,
        },
      });

      if (existing) {
        // تحديث النقطة الموجودة إذا كانت الأولوية أعلى
        if ((endpoint.priority ?? 0) > existing.priority) {
          await db.apiEndpoint.update({
            where: { id: existing.id },
            data: {
              priority: endpoint.priority,
              isAvailable: true,
              capabilities: endpoint.capabilities
                ? JSON.stringify(endpoint.capabilities)
                : undefined,
              metadata: endpoint.metadata
                ? JSON.stringify(endpoint.metadata)
                : undefined,
            },
          });
        }
        return existing.id;
      }

      // إنشاء نقطة نهاية جديدة
      const newEndpoint = await db.apiEndpoint.create({
        data: {
          name: endpoint.name,
          provider: endpoint.provider,
          category: endpoint.category,
          baseUrl: endpoint.baseUrl,
          modelId: endpoint.modelId ?? null,
          apiKey: endpoint.apiKey ?? null,
          authType: endpoint.authType,
          authHeader: endpoint.authHeader ?? null,
          apiFormat: endpoint.apiFormat,
          sourceRepo: endpoint.sourceRepo ?? null,
          sourceUrl: endpoint.sourceUrl ?? null,
          isFree: endpoint.isFree,
          isAvailable: true,
          priority: endpoint.priority ?? 50,
          capabilities: endpoint.capabilities
            ? JSON.stringify(endpoint.capabilities)
            : null,
          metadata: endpoint.metadata
            ? JSON.stringify(endpoint.metadata)
            : null,
        },
      });

      // إضافة إلى المجموعة في الذاكرة
      const category = endpoint.category as ApiCategory;
      if (!this.pool.has(category)) {
        this.pool.set(category, []);
      }
      const memEp: DiscoveredEndpoint & { _dbId: string } = {
        ...endpoint,
        _dbId: newEndpoint.id,
      };
      this.pool.get(category)!.push(memEp);

      // تخزين معرف قاعدة البيانات
      const key = `${endpoint.baseUrl}::${endpoint.modelId ?? ''}`;
      this.endpointIdMap.set(key, newEndpoint.id);

      return newEndpoint.id;
    } catch (error) {
      console.error('[مدير المجموعة] خطأ في إضافة نقطة نهاية:', error);
      throw error;
    }
  }

  /**
   * إزالة نقطة نهاية — تعليمها كغير متاحة في قاعدة البيانات وإزالتها من الذاكرة
   * @param id - معرف نقطة النهاية
   */
  async removeEndpoint(id: string): Promise<void> {
    try {
      // تعليم كغير متاحة في قاعدة البيانات
      await db.apiEndpoint.update({
        where: { id },
        data: { isAvailable: false },
      });

      // إزالة من الذاكرة باستخدام معرف قاعدة البيانات
      for (const [category, endpoints] of this.pool.entries()) {
        const index = endpoints.findIndex(
          (ep) => (ep as DiscoveredEndpoint & { _dbId?: string })._dbId === id
        );
        if (index !== -1) {
          endpoints.splice(index, 1);
          break; // نقطة واحدة فقط
        }
      }

      // إزالة من خريطة المعرفات
      for (const [key, dbId] of this.endpointIdMap.entries()) {
        if (dbId === id) {
          this.endpointIdMap.delete(key);
          break;
        }
      }
    } catch (error) {
      console.error('[مدير المجموعة] خطأ في إزالة نقطة نهاية:', error);
    }
  }

  /**
   * تسجيل فشل نقطة نهاية
   * يزيد عدد الإخفاقات المتتالية ويخفض الأولوية
   * ويُعطّل النقطة بعد 3 إخفاقات متتالية
   *
   * @param id - معرف نقطة النهاية
   * @param error - رسالة الخطأ
   */
  async markFailed(id: string, error: string): Promise<void> {
    try {
      const endpoint = await db.apiEndpoint.findUnique({
        where: { id },
      });

      if (!endpoint) return;

      const consecutiveFails = endpoint.consecutiveFails + 1;
      const newPriority = Math.max(0, endpoint.priority - 10);
      const isAvailable = consecutiveFails < MAX_CONSECUTIVE_FAILS;

      await db.apiEndpoint.update({
        where: { id },
        data: {
          consecutiveFails,
          priority: newPriority,
          isAvailable,
          lastError: error,
        },
      });

      // تحديث في الذاكرة
      this.updateEndpointInMemory(endpoint.category as ApiCategory, id, {
        priority: newPriority,
      });

      // إذا تعطلت النقطة، أعد تحميل المجموعة
      if (!isAvailable) {
        await this.refreshPool();
      }
    } catch (err) {
      console.error('[مدير المجموعة] خطأ في تسجيل الفشل:', err);
    }
  }

  /**
   * تسجيل نجاح نقطة نهاية
   * يعيد تعيين الإخفاقات المتتالية إلى 0
   * ويزيد الأولوية بمقدار 5 (حتى 100 كحد أقصى)
   * ويُحدّث متوسط وقت الاستجابة بمتوسط مرجح
   *
   * @param id - معرف نقطة النهاية
   * @param responseMs - وقت الاستجابة بالمللي ثانية
   */
  async markSuccess(id: string, responseMs: number): Promise<void> {
    try {
      const endpoint = await db.apiEndpoint.findUnique({
        where: { id },
      });

      if (!endpoint) return;

      const newPriority = Math.min(MAX_PRIORITY, endpoint.priority + 5);

      // حساب متوسط وقت الاستجابة المرجح (الأحدث أهم)
      const weight = 0.3; // وزن القيمة الجديدة
      const avgResponseMs =
        endpoint.avgResponseMs > 0
          ? endpoint.avgResponseMs * (1 - weight) + responseMs * weight
          : responseMs;

      await db.apiEndpoint.update({
        where: { id },
        data: {
          consecutiveFails: 0,
          priority: newPriority,
          avgResponseMs,
          isAvailable: true,
          lastError: null,
        },
      });

      // تحديث في الذاكرة
      this.updateEndpointInMemory(endpoint.category as ApiCategory, id, {
        priority: newPriority,
      });
    } catch (err) {
      console.error('[مدير المجموعة] خطأ في تسجيل النجاح:', err);
    }
  }

  /**
   * الحصول على إحصائيات المجموعة
   * @returns إحصائيات شاملة
   */
  getStats(): PoolStats {
    const allEndpoints: DiscoveredEndpoint[] = [];
    const byCategory: Record<string, number> = {};
    const byProvider: Record<string, number> = {};

    for (const [category, endpoints] of this.pool.entries()) {
      byCategory[category] = endpoints.length;
      allEndpoints.push(...endpoints);

      for (const ep of endpoints) {
        byProvider[ep.provider] = (byProvider[ep.provider] ?? 0) + 1;
      }
    }

    return {
      totalEndpoints: allEndpoints.length,
      availableEndpoints: allEndpoints.length, // جميع النقاط في الذاكرة متاحة
      byCategory,
      byProvider,
      lastUpdate: this.lastUpdate?.toISOString() ?? null,
    };
  }

  /**
   * بدء التحديث التلقائي للمجموعة
   * يقوم بتحديث المجموعة كل 5 دقائق
   */
  startAutoRefresh(): void {
    if (this.refreshTimer) {
      return; // يعمل بالفعل
    }

    this.refreshTimer = setInterval(() => {
      this.refreshPool().catch((err) => {
        console.error('[مدير المجموعة] خطأ في التحديث التلقائي:', err);
      });
    }, AUTO_REFRESH_INTERVAL_MS);

    console.log('[مدير المجموعة] تم بدء التحديث التلقائي (كل 5 دقائق)');
  }

  /**
   * إيقاف التحديث التلقائي
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log('[مدير المجموعة] تم إيقاف التحديث التلقائي');
    }
  }

  /**
   * إبطال ذاكرة التخزين المؤقت وإعادة تحميل المجموعة
   */
  async invalidateCache(): Promise<void> {
    await this.refreshPool();
  }

  /**
   * هل المجموعة تم تحميلها؟
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * تحديث نقطة نهاية في الذاكرة (بدون إعادة تحميل كاملة)
   * @param category - فئة نقطة النهاية
   * @param id - معرف نقطة النهاية في قاعدة البيانات
   * @param updates - الحقول المُحدّثة
   */
  private updateEndpointInMemory(
    category: ApiCategory,
    id: string,
    updates: Partial<Pick<DiscoveredEndpoint, 'priority'>>
  ): void {
    const endpoints = this.pool.get(category);
    if (!endpoints) return;

    // البحث عن نقطة النهاية المحددة بواسطة معرف قاعدة البيانات
    const target = endpoints.find(
      (ep) => (ep as DiscoveredEndpoint & { _dbId?: string })._dbId === id
    );

    if (target) {
      if (updates.priority !== undefined) {
        target.priority = updates.priority;
      }
    }

    // إعادة ترتيب حسب الأولوية
    endpoints.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
  }
}

/** تصدير النسخة الوحيدة من مدير المجموعة */
export const poolManager = PoolManager.getInstance();
