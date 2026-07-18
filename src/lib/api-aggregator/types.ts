// ═══════════════════════════════════════════════════════════
// أنواع المُجمّع (Aggregator Types) — تعريفات TypeScript
// ═══════════════════════════════════════════════════════════

/** فئات API المدعومة */
export type ApiCategory = 'chat' | 'image' | 'video' | 'asr' | 'translation';

/** أنواع المصادقة */
export type ApiAuthType = 'none' | 'bearer' | 'x-api-key' | 'custom';

/** تنسيقات API */
export type ApiFormat = 'openai' | 'hf-inference' | 'pollinations' | 'raw' | 'gemini';

/** حالات التحقق */
export type ValidationStatus = 'success' | 'fail' | 'timeout' | 'rate_limited';

/** أنواع مهام التجميع */
export type JobType = 'scrape' | 'validate' | 'full_cycle';

/** حالات مهام التجميع */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/** نقطة نهاية مُكتشفة من مصدر خارجي */
export interface DiscoveredEndpoint {
  name: string;
  provider: string;
  category: ApiCategory;
  baseUrl: string;
  modelId?: string;
  apiKey?: string;
  authType: ApiAuthType;
  authHeader?: string;
  apiFormat: ApiFormat;
  sourceRepo?: string;
  sourceUrl?: string;
  isFree: boolean;
  priority?: number;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** نتيجة التحقق من نقطة نهاية */
export interface ValidationResult {
  endpointId: string;
  status: ValidationStatus;
  responseMs: number;
  statusCode?: number;
  errorMessage?: string;
}

/** مصدر تم استخراجه من GitHub */
export interface ScrapedSource {
  repo: string;
  url: string;
  endpointsFound: number;
  errors: string[];
  /** نقاط النهاية المُكتشفة والمُصنّفة من المحتوى */
  discoveredEndpoints: DiscoveredEndpoint[];
}

/** نتيجة دورة التجميع الكاملة */
export interface AggregationResult {
  sourcesScraped: number;
  endpointsFound: number;
  endpointsValidated: number;
  endpointsAdded: number;
  endpointsRemoved: number;
  errors: string[];
  duration: number;
}

/** إحصائيات مجموعة نقاط النهاية */
export interface PoolStats {
  totalEndpoints: number;
  availableEndpoints: number;
  byCategory: Record<string, number>;
  byProvider: Record<string, number>;
  lastUpdate: string | null;
}

/** حالة المجدول */
export interface SchedulerStatus {
  isRunning: boolean;
  lastRun: string | null;
  nextRun: string | null;
  intervalMs: number;
  lastResult: AggregationResult | null;
}
