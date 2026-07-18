// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Rate Limiting Middleware (v2)
// ═══════════════════════════════════════════════════════════════════════
// Pluggable rate limiter for API endpoints with support for:
//   - In-memory store (default, current behavior)
//   - Redis store (via factory, no dependency added)
//   - Per-user rate limiting (user ID if authenticated, IP if guest)
//   - Fixed-window and sliding-window algorithms
//
// ⚠️ IN-MEMORY LIMITATION: Rate limits reset on server restart and are
// not shared across multiple instances. For production deployments with
// multiple instances (Docker/K8s), use the Redis store.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════════════
// RateLimiterStore — Abstract storage backend interface
// ═══════════════════════════════════════════════════════════════════════
// Allows swapping the storage backend (in-memory, Redis, etc.) without
// changing the rate-limiting logic.
// ═══════════════════════════════════════════════════════════════════════

export interface RateLimitEntry {
  /** Number of requests in the current window */
  count: number;
  /** Timestamp (ms) when the current window resets */
  resetTime: number;
  /** (Sliding window only) Timestamps of individual requests within the window */
  timestamps?: number[];
}

export interface RateLimiterStore {
  /**
   * Get the current rate limit entry for a key.
   * Returns undefined if no entry exists.
   */
  get(key: string): Promise<RateLimitEntry | undefined>;

  /**
   * Set (or overwrite) the rate limit entry for a key.
   */
  set(key: string, entry: RateLimitEntry): Promise<void>;

  /**
   * Increment the count for an existing entry.
   * Implementations should handle this atomically for distributed stores.
   */
  increment(key: string): Promise<RateLimitEntry>;

  /**
   * Delete a rate limit entry.
   */
  delete(key: string): Promise<void>;

  /**
   * Remove all entries that have expired (resetTime < now).
   * Called periodically to prevent memory leaks.
   */
  cleanupExpired(): Promise<number>;
}

// ═══════════════════════════════════════════════════════════════════════
// In-Memory Store — Default implementation
// ═══════════════════════════════════════════════════════════════════════

export class InMemoryRateLimiterStore implements RateLimiterStore {
  private store = new Map<string, RateLimitEntry>();

  async get(key: string): Promise<RateLimitEntry | undefined> {
    return this.store.get(key);
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async increment(key: string): Promise<RateLimitEntry> {
    const entry = this.store.get(key);
    if (!entry) {
      throw new Error(`[InMemoryStore] Cannot increment non-existent key: ${key}`);
    }
    entry.count++;
    this.store.set(key, entry);
    return entry;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Get the number of entries currently stored (for diagnostics) */
  get size(): number {
    return this.store.size;
  }
}

// Default global store instance
const defaultStore = new InMemoryRateLimiterStore();

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  defaultStore.cleanupExpired().catch(() => {});
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════
// Redis Store — Factory function for future Redis support
// ═══════════════════════════════════════════════════════════════════════
// This factory returns a RateLimiterStore backed by Redis.
// It does NOT add a Redis dependency — the caller must install ioredis
// and pass the connection URL. If ioredis is not available, the factory
// throws a helpful error.
//
// Usage (when ready to enable Redis):
//   const store = createRedisStore('redis://localhost:6379');
//   const limiter = new RateLimiter({ store, ... });
// ═══════════════════════════════════════════════════════════════════════

export interface RedisStoreOptions {
  /** Redis connection URL, e.g. 'redis://localhost:6379' */
  url: string;
  /** Optional key prefix for all rate limit keys */
  keyPrefix?: string;
  /** Optional TTL for keys (in seconds). Defaults to windowMs / 1000 * 2 */
  ttlSeconds?: number;
}

/**
 * Create a Redis-backed rate limiter store.
 *
 * NOTE: This requires the `ioredis` package to be installed.
 * It is NOT included as a dependency by default. To use:
 *
 *   1. Install: `bun add ioredis`
 *   2. Create store: `const store = createRedisStore({ url: 'redis://...' })`
 *   3. Pass to RateLimiter: `new RateLimiter({ store, ... })`
 *
 * @param options - Redis connection configuration
 * @returns A RateLimiterStore backed by Redis
 * @throws Error if ioredis is not installed
 */
export function createRedisStore(options: RedisStoreOptions | string): RateLimiterStore {
  const config: RedisStoreOptions =
    typeof options === 'string' ? { url: options } : options;

  // Lazy-load ioredis — will throw if not installed
  let redis: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ioredis = require('ioredis');
    redis = new ioredis.default(config.url);
  } catch {
    throw new Error(
      '[RateLimit] Redis store requires the "ioredis" package. ' +
        'Install it with: bun add ioredis'
    );
  }

  const prefix = config.keyPrefix ?? 'rl:';

  return {
    async get(key: string): Promise<RateLimitEntry | undefined> {
      const data = await (redis as { get: (k: string) => Promise<string | null> }).get(
        `${prefix}${key}`
      );
      if (!data) return undefined;
      try {
        return JSON.parse(data) as RateLimitEntry;
      } catch {
        return undefined;
      }
    },

    async set(key: string, entry: RateLimitEntry): Promise<void> {
      const ttl = config.ttlSeconds ?? Math.ceil((entry.resetTime - Date.now()) / 1000) * 2;
      await (redis as { set: (k: string, v: string, ex: string, t: number) => Promise<unknown> }).set(
        `${prefix}${key}`,
        JSON.stringify(entry),
        'EX',
        ttl
      );
    },

    async increment(key: string): Promise<RateLimitEntry> {
      const fullKey = `${prefix}${key}`;
      const r: any = redis;
      const data = await r.get(fullKey);
      let parsed: RateLimitEntry;
      if (data) {
        parsed = JSON.parse(data) as RateLimitEntry;
        parsed.count++;
      } else {
        throw new Error(`[RedisStore] Cannot increment non-existent key: ${key}`);
      }
      const ttl = config.ttlSeconds ?? Math.ceil((parsed.resetTime - Date.now()) / 1000) * 2;
      await r.set(fullKey, JSON.stringify(parsed), 'EX', ttl);
      return parsed;
    },

    async delete(key: string): Promise<void> {
      await (redis as { del: (k: string) => Promise<number> }).del(`${prefix}${key}`);
    },

    async cleanupExpired(): Promise<number> {
      // Redis handles expiration via TTL, so this is a no-op
      return 0;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Rate Limit Configuration
// ═══════════════════════════════════════════════════════════════════════

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional key prefix for grouping */
  keyPrefix?: string;
  /**
   * Use sliding window algorithm for more accurate rate limiting.
   * - false (default): Fixed window — count resets at window boundary.
   *   Simple but can allow 2x burst at window edges.
   * - true: Sliding window — tracks individual request timestamps.
   *   More accurate but uses more memory per key.
   * @default false
   */
  slidingWindow?: boolean;
  /**
   * Custom store backend. Defaults to the global in-memory store.
   * Pass a Redis store for distributed rate limiting.
   */
  store?: RateLimiterStore;
}

// Preset configurations for different endpoint types
export const RATE_LIMIT_PRESETS = {
  /** Auth endpoints: 5 requests per minute */
  auth: { maxRequests: 5, windowMs: 60 * 1000, keyPrefix: 'auth' },
  /** AI generation endpoints: 20 requests per minute */
  ai: { maxRequests: 20, windowMs: 60 * 1000, keyPrefix: 'ai' },
  /** TTS/ASR endpoints: 30 requests per minute (guests get lower limit) */
  media: { maxRequests: 30, windowMs: 60 * 1000, keyPrefix: 'media' },
  /** General API: 60 requests per minute */
  general: { maxRequests: 60, windowMs: 60 * 1000, keyPrefix: 'general' },
} as const;

// ═══════════════════════════════════════════════════════════════════════
// Client IP Extraction
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get client IP from request headers
 */
function getClientIP(request: NextRequest): string {
  // Try common proxy headers first
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  return 'unknown';
}

/**
 * Build the rate limit key from prefix and identity.
 * Uses user ID if authenticated, IP address if guest.
 */
function buildRateLimitKey(
  keyPrefix: string,
  userId: string | undefined,
  ip: string
): string {
  return userId
    ? `${keyPrefix}:user:${userId}`
    : `${keyPrefix}:ip:${ip}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Fixed-Window Rate Limiting (original algorithm)
// ═══════════════════════════════════════════════════════════════════════

async function checkFixedWindow(
  store: RateLimiterStore,
  key: string,
  options: RateLimitOptions
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const entry = await store.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    const resetTime = now + options.windowMs;
    await store.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: options.maxRequests - 1, resetTime };
  }

  if (entry.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }

  const updated = await store.increment(key);
  return {
    allowed: true,
    remaining: Math.max(0, options.maxRequests - updated.count),
    resetTime: entry.resetTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Sliding-Window Rate Limiting (more accurate)
// ═══════════════════════════════════════════════════════════════════════
// Instead of a simple counter that resets at window boundaries, this
// tracks individual request timestamps and counts only those within
// the sliding window. This prevents the "2x burst at window edge"
// problem that fixed windows have.
// ═══════════════════════════════════════════════════════════════════════

async function checkSlidingWindow(
  store: RateLimiterStore,
  key: string,
  options: RateLimitOptions
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const resetTime = now + options.windowMs;

  const entry = await store.get(key);

  // Filter timestamps to only those within the sliding window
  let timestamps: number[] = [];
  if (entry?.timestamps) {
    timestamps = entry.timestamps.filter((ts) => ts > windowStart);
  }

  if (timestamps.length >= options.maxRequests) {
    // The oldest timestamp in the window determines when the rate limit resets
    const oldestInWindow = timestamps[0];
    const actualResetTime = oldestInWindow + options.windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetTime: actualResetTime,
    };
  }

  // Add current request timestamp
  timestamps.push(now);
  await store.set(key, {
    count: timestamps.length,
    resetTime,
    timestamps,
  });

  return {
    allowed: true,
    remaining: options.maxRequests - timestamps.length,
    resetTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check rate limit for a request. Returns null if allowed, or a NextResponse
 * with 429 status if rate limit is exceeded.
 *
 * Per-user rate limiting:
 * - If userId is provided, the rate limit is keyed by user ID.
 * - If userId is not provided (guest), the rate limit is keyed by IP address.
 * - This ensures authenticated users get their own quota separate from guests.
 *
 * @param request - The incoming NextRequest
 * @param options - Rate limit configuration
 * @param userId - Optional user ID for per-user rate limiting
 * @returns null if allowed, NextResponse with 429 if blocked
 */
export function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
  userId?: string
): NextResponse | null {
  const store = options.store ?? defaultStore;
  const ip = getClientIP(request);
  const key = buildRateLimitKey(options.keyPrefix || 'rl', userId, ip);

  // Choose algorithm based on slidingWindow option
  const checkPromise = options.slidingWindow
    ? checkSlidingWindow(store, key, options)
    : checkFixedWindow(store, key, options);

  // We need to handle this asynchronously, but the original API is sync.
  // The original checkRateLimit returns NextResponse | null synchronously,
  // but the new store interface is async. We bridge this by using a
  // synchronous wrapper that kicks off the async work.
  // NOTE: This is a breaking change — the function now needs to be awaited.
  // For backward compatibility, we provide a sync path for the default
  // in-memory store.
  if (store instanceof InMemoryRateLimiterStore) {
    return checkRateLimitSync(store, key, options);
  }

  // For async stores, we return a pending response that will be resolved
  // by the caller using checkRateLimitAsync instead.
  // This maintains backward compatibility while enabling async stores.
  return null; // Placeholder — callers should use checkRateLimitAsync for async stores
}

/**
 * Synchronous rate limit check for in-memory store.
 * Preserves the original sync API for backward compatibility.
 */
function checkRateLimitSync(
  store: InMemoryRateLimiterStore,
  key: string,
  options: RateLimitOptions
): NextResponse | null {
  if (options.slidingWindow) {
    // Sliding window with in-memory store
    const now = Date.now();
    const windowStart = now - options.windowMs;
    const resetTime = now + options.windowMs;

    const entry = store['store'].get(key) as RateLimitEntry | undefined;
    let timestamps: number[] = [];
    if (entry?.timestamps) {
      timestamps = entry.timestamps.filter((ts) => ts > windowStart);
    }

    if (timestamps.length >= options.maxRequests) {
      const oldestInWindow = timestamps[0];
      const actualResetTime = oldestInWindow + options.windowMs;
      const retryAfter = Math.ceil((actualResetTime - now) / 1000);
      return buildRateLimitResponse(retryAfter, options.maxRequests, actualResetTime);
    }

    timestamps.push(now);
    store['store'].set(key, { count: timestamps.length, resetTime, timestamps });
    return null; // Allowed
  }

  // Fixed window (original algorithm)
  const now = Date.now();
  const entry = store['store'].get(key) as RateLimitEntry | undefined;

  if (!entry || now > entry.resetTime) {
    store['store'].set(key, { count: 1, resetTime: now + options.windowMs });
    return null;
  }

  if (entry.count >= options.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return buildRateLimitResponse(retryAfter, options.maxRequests, entry.resetTime);
  }

  entry.count++;
  return null; // Allowed
}

/**
 * Build a 429 Too Many Requests response with proper headers.
 */
function buildRateLimitResponse(
  retryAfter: number,
  limit: number,
  resetTime: number
): NextResponse {
  return NextResponse.json(
    {
      error: 'تم تجاوز الحد المسموح من الطلبات',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
      },
    }
  );
}

/**
 * Async rate limit check — required for Redis or other async stores.
 * Use this instead of checkRateLimit when using a non-memory store.
 *
 * @param request - The incoming NextRequest
 * @param options - Rate limit configuration
 * @param userId - Optional user ID for per-user rate limiting
 * @returns null if allowed, NextResponse with 429 if blocked
 */
export async function checkRateLimitAsync(
  request: NextRequest,
  options: RateLimitOptions,
  userId?: string
): Promise<NextResponse | null> {
  const store = options.store ?? defaultStore;
  const ip = getClientIP(request);
  const key = buildRateLimitKey(options.keyPrefix || 'rl', userId, ip);

  const result = options.slidingWindow
    ? await checkSlidingWindow(store, key, options)
    : await checkFixedWindow(store, key, options);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    return buildRateLimitResponse(retryAfter, options.maxRequests, result.resetTime);
  }

  return null; // Allowed
}

/**
 * Helper to get remaining rate limit headers for successful responses.
 * Works with both sync (in-memory) and async stores.
 */
export function getRateLimitHeaders(
  request: NextRequest,
  options: RateLimitOptions,
  userId?: string
): Record<string, string> {
  const ip = getClientIP(request);
  const key = buildRateLimitKey(options.keyPrefix || 'rl', userId, ip);

  // For backward compatibility, this only works with the in-memory store
  const store = (options.store as InMemoryRateLimiterStore | undefined) ?? defaultStore;
  if (!(store instanceof InMemoryRateLimiterStore)) {
    // Can't synchronously read from async stores
    return {
      'X-RateLimit-Limit': String(options.maxRequests),
      'X-RateLimit-Remaining': String(options.maxRequests),
    };
  }

  const entry = store['store'].get(key) as RateLimitEntry | undefined;
  const remaining = entry
    ? Math.max(0, options.maxRequests - entry.count)
    : options.maxRequests;

  return {
    'X-RateLimit-Limit': String(options.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
  };
}

/**
 * Async version of getRateLimitHeaders — required for Redis or other async stores.
 */
export async function getRateLimitHeadersAsync(
  request: NextRequest,
  options: RateLimitOptions,
  userId?: string
): Promise<Record<string, string>> {
  const store = options.store ?? defaultStore;
  const ip = getClientIP(request);
  const key = buildRateLimitKey(options.keyPrefix || 'rl', userId, ip);

  const entry = await store.get(key);
  const remaining = entry
    ? Math.max(0, options.maxRequests - entry.count)
    : options.maxRequests;

  return {
    'X-RateLimit-Limit': String(options.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
  };
}
