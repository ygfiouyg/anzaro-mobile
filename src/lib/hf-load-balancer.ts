// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — HuggingFace Load Balancer
// ═══════════════════════════════════════════════════════════════════════
// Tracks model health, rate-limiting, and cold-start status to select
// the best available model for each request. Designed for the HF
// Serverless Inference API which has per-model rate limits and cold starts.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

/** Health status for a single model */
interface ModelHealth {
  /** Model ID (e.g., 'meta-llama/Llama-3.1-8B-Instruct') */
  modelId: string;
  /** Number of successful requests */
  successCount: number;
  /** Number of failed requests */
  failCount: number;
  /** Whether this model is currently rate-limited */
  rateLimited: boolean;
  /** Timestamp when rate limit expires (ms since epoch) */
  rateLimitExpiry: number;
  /** Whether this model is currently loading (cold start) */
  loading: boolean;
  /** Timestamp when loading state expires (ms since epoch) */
  loadingExpiry: number;
  /** Average response time in ms (rolling window) */
  avgResponseMs: number;
  /** Last time this model was successfully used */
  lastSuccessAt: number;
  /** Whether the model is marked as unavailable (persistent failure) */
  unavailable: boolean;
  /** Timestamp when unavailable state resets */
  unavailableExpiry: number;
  /** Supported modes (e.g., ['text2video', 'image2video']) */
  supportedModes: string[];
  /** Whether the model is registered as available */
  registeredAvailable: boolean;
}

/** Options for selecting a model */
export interface ModelSelectionOptions {
  /** Preferred models to try first (in order) */
  preferredModels?: string[];
  /** Category to fall back to if preferred models fail */
  category?: string;
  /** Exclude specific model IDs */
  excludeModels?: string[];
  /** Maximum number of attempts before giving up */
  maxAttempts?: number;
  /** Mode filter (e.g., 'text2video', 'image2video') */
  mode?: string;
  /** Preferred models (alias used by video service) */
  preferred?: string[];
}

/** Result of model selection */
export interface ModelSelectionResult {
  /** Selected model ID */
  modelId: string;
  /** Whether this was a preferred model or a fallback */
  isFallback: boolean;
  /** Selection reason for logging */
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────
const RATE_LIMIT_COOLDOWN_MS = 30_000;   // 30s cooldown after rate limit
const LOADING_COOLDOWN_MS = 60_000;      // 60s cooldown for loading models
const UNAVAILABLE_COOLDOWN_MS = 120_000;  // 2min cooldown for unavailable models
const MAX_AVG_RESPONSE_SAMPLES = 20;      // Rolling window for avg response time
const HEALTH_RESET_INTERVAL_MS = 1_800_000; // Reset health stats every 30 min
const INACTIVE_THRESHOLD_MS = 1_800_000; // Consider models inactive after 30 min of no use

// ═══════════════════════════════════════════════════════════════════════
// HF Load Balancer Class
// ═══════════════════════════════════════════════════════════════════════

class HFLoadBalancer {
  private healthMap = new Map<string, ModelHealth>();
  private lastHealthReset = Date.now();

  /** Get or create health entry for a model */
  private getHealth(modelId: string): ModelHealth {
    let health = this.healthMap.get(modelId);
    if (!health) {
      health = {
        modelId,
        successCount: 0,
        failCount: 0,
        rateLimited: false,
        rateLimitExpiry: 0,
        loading: false,
        loadingExpiry: 0,
        avgResponseMs: 0,
        lastSuccessAt: 0,
        unavailable: false,
        unavailableExpiry: 0,
        supportedModes: [],
        registeredAvailable: true,
      };
      this.healthMap.set(modelId, health);
    }
    return health;
  }

  /** Check if health stats should be reset */
  private maybeResetHealth(): void {
    const now = Date.now();
    if (now - this.lastHealthReset > HEALTH_RESET_INTERVAL_MS) {
      // Smart reset: only clear stats for inactive models (not used recently),
      // preserving stats for actively used models so rate-limited/cold models
      // don't get retried prematurely.
      const keysToDelete: string[] = [];
      for (const [modelId, health] of this.healthMap.entries()) {
        const isInactive = health.lastSuccessAt === 0
          || (now - health.lastSuccessAt) > INACTIVE_THRESHOLD_MS;
        if (isInactive) {
          keysToDelete.push(modelId);
        }
      }
      for (const key of keysToDelete) {
        this.healthMap.delete(key);
      }
      this.lastHealthReset = now;
      console.log(`[HF-LB] Health stats smart reset: cleared ${keysToDelete.length} inactive models, kept ${this.healthMap.size} active models`);
    }
  }

  /** Check if a model is currently usable (not rate-limited, not loading, not unavailable) */
  isModelUsable(modelId: string): boolean {
    const health = this.getHealth(modelId);
    const now = Date.now();

    // Check rate limit
    if (health.rateLimited && now < health.rateLimitExpiry) {
      return false;
    }

    // Check loading
    if (health.loading && now < health.loadingExpiry) {
      return false;
    }

    // Check unavailable
    if (health.unavailable && now < health.unavailableExpiry) {
      return false;
    }

    return true;
  }

  /**
   * Alias: isModelAvailable / isAvailable
   * Same as isModelUsable — for compatibility with image and video services.
   */
  isModelAvailable(modelId: string): boolean {
    return this.isModelUsable(modelId);
  }

  isAvailable(modelId: string): boolean {
    return this.isModelUsable(modelId);
  }

  /** Record a successful request */
  recordSuccess(modelId: string, responseTimeMs: number): void {
    const health = this.getHealth(modelId);
    health.successCount++;
    health.lastSuccessAt = Date.now();

    // Update average response time (rolling)
    if (health.avgResponseMs === 0) {
      health.avgResponseMs = responseTimeMs;
    } else {
      const alpha = 1 / MAX_AVG_RESPONSE_SAMPLES;
      health.avgResponseMs = health.avgResponseMs * (1 - alpha) + responseTimeMs * alpha;
    }

    // Clear negative states
    health.rateLimited = false;
    health.rateLimitExpiry = 0;
    health.loading = false;
    health.loadingExpiry = 0;
    health.unavailable = false;
    health.unavailableExpiry = 0;

    console.log(`[HF-LB] Success: ${modelId} (${responseTimeMs}ms, avg: ${Math.round(health.avgResponseMs)}ms)`);
  }

  /** Record a failed request */
  recordFailure(modelId: string, errorType: 'rate_limit' | 'loading' | 'timeout' | 'error' | 'server-error' | 'rate-limit' | 'unknown'): void {
    const health = this.getHealth(modelId);
    health.failCount++;
    const now = Date.now();

    // Normalize error type aliases
    const normalizedType = errorType === 'rate-limit' ? 'rate_limit'
      : errorType === 'server-error' ? 'loading'
      : errorType === 'unknown' ? 'error'
      : errorType;

    switch (normalizedType) {
      case 'rate_limit':
        health.rateLimited = true;
        health.rateLimitExpiry = now + RATE_LIMIT_COOLDOWN_MS;
        console.log(`[HF-LB] Rate limited: ${modelId} (cooldown ${RATE_LIMIT_COOLDOWN_MS / 1000}s)`);
        break;
      case 'loading':
        health.loading = true;
        health.loadingExpiry = now + LOADING_COOLDOWN_MS;
        console.log(`[HF-LB] Cold start: ${modelId} (cooldown ${LOADING_COOLDOWN_MS / 1000}s)`);
        break;
      case 'timeout':
        health.unavailable = true;
        health.unavailableExpiry = now + UNAVAILABLE_COOLDOWN_MS;
        console.log(`[HF-LB] Timeout: ${modelId} (cooldown ${UNAVAILABLE_COOLDOWN_MS / 1000}s)`);
        break;
      case 'error':
        // After 3 consecutive failures, mark as temporarily unavailable
        if (health.failCount >= 3 && health.successCount === 0) {
          health.unavailable = true;
          health.unavailableExpiry = now + UNAVAILABLE_COOLDOWN_MS;
          console.log(`[HF-LB] Marked unavailable: ${modelId} (${health.failCount} failures)`);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Record an error (alias for video service compatibility).
   * Maps error types to the internal recordFailure format.
   */
  recordError(modelId: string, _errorMsg: string, errorType: 'generic' | 'rate_limit' | 'timeout'): void {
    const mappedType: 'rate_limit' | 'loading' | 'timeout' | 'error' =
      errorType === 'rate_limit' ? 'rate_limit'
      : errorType === 'timeout' ? 'timeout'
      : 'error';
    this.recordFailure(modelId, mappedType);
  }

  /**
   * Register a model with the load balancer.
   * Used by video service to register models with their capabilities.
   */
  registerModel(modelId: string, supportedModes: string[] = [], available: boolean = true): void {
    const health = this.getHealth(modelId);
    health.supportedModes = supportedModes;
    health.registeredAvailable = available;
  }

  /**
   * Select the best model from a list of candidates.
   * Priority: usable > preferred > fastest avg response > most reliable
   */
  selectBestModel(
    candidates: string[],
    options?: ModelSelectionOptions
  ): ModelSelectionResult | null {
    this.maybeResetHealth();

    const excludeSet = new Set(options?.excludeModels ?? []);
    const preferredSet = new Set(options?.preferredModels ?? options?.preferred ?? []);

    // Filter out excluded models
    const available = candidates.filter((id) => !excludeSet.has(id));

    // Filter by mode if specified
    const modeFiltered = options?.mode
      ? available.filter((id) => {
          const health = this.getHealth(id);
          return health.supportedModes.length === 0 || health.supportedModes.includes(options.mode!);
        })
      : available;

    // Separate into usable and not-usable
    const usable = modeFiltered.filter((id) => this.isModelUsable(id));

    if (usable.length === 0) {
      console.log('[HF-LB] No usable models found from candidates');
      return null;
    }

    // Sort by priority:
    // 1. Preferred models first
    // 2. By success rate (success / total)
    // 3. By average response time
    // 4. By last success time (more recent = better)
    const scored = usable.map((modelId) => {
      const health = this.getHealth(modelId);
      const total = health.successCount + health.failCount;
      const successRate = total > 0 ? health.successCount / total : 0.5; // Default 0.5 for unknown
      const isPreferred = preferredSet.has(modelId);

      // Score: higher is better
      // Preferred bonus: +1000
      // Success rate: 0-100
      // Response time: inversely proportional (lower = better)
      const preferredBonus = isPreferred ? 1000 : 0;
      const successScore = successRate * 100;
      const responseScore = health.avgResponseMs > 0 ? Math.max(0, 50 - health.avgResponseMs / 100) : 25; // Unknown gets 25

      const score = preferredBonus + successScore + responseScore;

      return { modelId, score, isPreferred, successRate, avgResponseMs: health.avgResponseMs };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return {
      modelId: best.modelId,
      isFallback: !best.isPreferred,
      reason: `score=${best.score.toFixed(1)}, successRate=${(best.successRate * 100).toFixed(0)}%, avgMs=${Math.round(best.avgResponseMs)}`,
    };
  }

  /**
   * Alias: selectModel
   * Same as selectBestModel — for compatibility with image and video services.
   */
  selectModel(candidates: string[], options?: ModelSelectionOptions): ModelSelectionResult | null {
    return this.selectBestModel(candidates, options);
  }

  /** Get health stats for a specific model */
  getHealthStats(modelId: string): ModelHealth | undefined {
    return this.healthMap.get(modelId);
  }

  /** Get all health stats */
  getAllHealthStats(): Map<string, ModelHealth> {
    return new Map(this.healthMap);
  }

  /** Get the number of currently usable models from a list */
  getUsableCount(modelIds: string[]): number {
    return modelIds.filter((id) => this.isModelUsable(id)).length;
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────
let loadBalancerInstance: HFLoadBalancer | null = null;

/** Get the singleton load balancer instance */
export function getHFLoadBalancer(): HFLoadBalancer {
  if (!loadBalancerInstance) {
    loadBalancerInstance = new HFLoadBalancer();
    console.log('[HF-LB] Load balancer initialized');
  }
  return loadBalancerInstance;
}

/** Reset the load balancer (for testing) */
export function resetHFLoadBalancer(): void {
  loadBalancerInstance = null;
}

export type { ModelHealth };
