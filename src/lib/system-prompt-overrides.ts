// ─── System Prompt Overrides ─────────────────────────────────────────
// نظام تجاوز برومبتس النظام — يتيح تعديل البرومبتس الافتراضية من لوحة الآدمن
// يستخدم كاش محلي بـ TTL 5 دقائق لتقليل ضغط قاعدة البيانات

import { db } from '@/lib/db';

/** كاش لتجاوزات برومبتس النظام (TTL 5 دقائق) */
let overridesCache: Map<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

/** جلب خريطة التجاوزات النشطة من قاعدة البيانات */
async function getOverridesMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (overridesCache && now - cacheTimestamp < CACHE_TTL) {
    return overridesCache;
  }
  const overrides = await db.systemPromptOverride.findMany({
    where: { isActive: true },
  });
  overridesCache = new Map(overrides.map(o => [o.key, o.value]));
  cacheTimestamp = now;
  return overridesCache;
}

/** جلب البرومبت الفعّال لنموذج معيّن، مع التحقق من التجاوزات أولاً */
export async function getEffectiveModelPrompt(modelId: string, defaultPrompt: string): Promise<string> {
  try {
    const overrides = await getOverridesMap();
    const key = `model:${modelId}`;
    return overrides.get(key) || defaultPrompt;
  } catch (error) {
    console.warn('[SystemPromptOverrides] Failed to get overrides, using default:', error);
    return defaultPrompt;
  }
}

/** جلب البرومبت الفعّال لاستراتيجية المحتوى، مع التحقق من التجاوزات أولاً */
export async function getEffectiveContentStrategyPrompt(defaultPrompt: string): Promise<string> {
  try {
    const overrides = await getOverridesMap();
    const key = 'feature:content-strategy';
    return overrides.get(key) || defaultPrompt;
  } catch (error) {
    console.warn('[SystemPromptOverrides] Failed to get content strategy override, using default:', error);
    return defaultPrompt;
  }
}

/** إبطال كاش التجاوزات (يُستدعى بعد حفظ التغييرات) */
export function invalidateOverridesCache(): void {
  overridesCache = null;
  cacheTimestamp = 0;
}
