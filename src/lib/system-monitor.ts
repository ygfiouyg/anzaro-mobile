// DeltaAI System Monitor & Self-Healing Service
// Tracks metrics, detects anomalies, and auto-heals issues

export interface SystemMetrics {
  timestamp: number;
  memoryUsage: { used: number; total: number; percentage: number };
  activeConnections: number;
  errorRate: number;
  apiResponseTimes: Record<string, number[]>;
  errors: Array<{ route: string; error: string; timestamp: number }>;
  healingActions: Array<{ action: string; reason: string; timestamp: number }>;
}

interface ErrorRecord {
  route: string;
  error: string;
  timestamp: number;
}

interface HealingRecord {
  action: string;
  reason: string;
  timestamp: number;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: { usedMB: number; totalMB: number; percentage: number };
  activeConnections: number;
  errorRate: number;
  recentErrors: number;
  healingActions: number;
  details: string[];
}

// ─── Configuration ────────────────────────────────────────────────────
const MAX_ERRORS_STORED = 500;
const MAX_HEALING_STORED = 200;
const MAX_RESPONSE_TIMES_PER_ROUTE = 100;
const ERROR_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MEMORY_LEAK_THRESHOLD_PERCENT = 85; // 85% memory usage triggers alert
const ERROR_SPIKE_THRESHOLD = 10; // 10 errors in the window = spike
const STUCK_CONNECTION_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes — matches chat stream inactivity timeout
const METRICS_RETENTION_MS = 30 * 60 * 1000; // 30 minutes of metrics history

// ─── In-Memory Storage ────────────────────────────────────────────────
let errors: ErrorRecord[] = [];
let healingActions: HealingRecord[] = [];
let apiResponseTimes: Map<string, number[]> = new Map();
let activeConnections: Set<{ id: string; startTime: number; route: string }> = new Set();
let metricsHistory: SystemMetrics[] = [];
let totalRequests = 0;
let totalErrors = 0;
const startTime = Date.now();

// ─── ZAI SDK Client Reset ─────────────────────────────────────────────
// FIX #17: Don't null the singleton client — it breaks parallel requests.
// The getZAIClient() singleton handles reconnection automatically.
// Only reset the init promise so next call re-initializes.
declare global {
  var _zaiClient: any;
  var _zaiInitPromise: Promise<any> | null;
}

function resetZAIClient(reason: string) {
  // Instead of nulling the client (which kills in-flight requests),
  // reset the init promise so the next getZAIClient() call re-initializes.
  // The existing client remains usable until the new one is ready.
  if (globalThis._zaiInitPromise) {
    globalThis._zaiInitPromise = null;
    recordHealingAction('reset_zai_init_promise', reason);
  }
}

// ─── Core Metrics Collection ──────────────────────────────────────────

function getMemoryUsage(): { used: number; total: number; percentage: number } {
  const mem = process.memoryUsage();
  // Use heap as "used" and a reasonable total (512MB default Node limit)
  const used = mem.heapUsed;
  const total = mem.heapTotal;
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0;
  return { used, total, percentage };
}

function getErrorRate(): number {
  const now = Date.now();
  const windowStart = now - ERROR_RATE_WINDOW_MS;
  const recentErrors = errors.filter((e) => e.timestamp > windowStart);
  return recentErrors.length;
}

function cleanOldRecords() {
  const now = Date.now();

  // Clean old errors beyond retention
  if (errors.length > MAX_ERRORS_STORED) {
    errors = errors.slice(-MAX_ERRORS_STORED);
  }

  // Clean old healing actions
  if (healingActions.length > MAX_HEALING_STORED) {
    healingActions = healingActions.slice(-MAX_HEALING_STORED);
  }

  // Clean old metrics history
  const cutoff = now - METRICS_RETENTION_MS;
  metricsHistory = metricsHistory.filter((m) => m.timestamp > cutoff);

  // Clean stuck connections
  for (const conn of activeConnections) {
    if (now - conn.startTime > STUCK_CONNECTION_TIMEOUT_MS) {
      activeConnections.delete(conn);
      recordHealingAction('clear_stuck_connection', `Stuck connection on ${conn.route} for ${Math.round((now - conn.startTime) / 1000)}s`);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────

export function recordError(route: string, error: string) {
  try {
    totalErrors++;
    errors.push({ route, error, timestamp: Date.now() });
    if (errors.length > MAX_ERRORS_STORED) {
      errors = errors.slice(-MAX_ERRORS_STORED);
    }

    // Check for error spike
    const errorRate = getErrorRate();
    if (errorRate >= ERROR_SPIKE_THRESHOLD) {
      performSelfHealing('error_spike', `Error rate ${errorRate} exceeds threshold ${ERROR_SPIKE_THRESHOLD} on route ${route}`);
    }
  } catch (err) {
    console.warn('[SystemMonitor] recordError failed:', err instanceof Error ? err.message : String(err));
  }
}

export function recordApiResponseTime(route: string, durationMs: number) {
  try {
    totalRequests++;
    const times = apiResponseTimes.get(route) || [];
    times.push(durationMs);
    if (times.length > MAX_RESPONSE_TIMES_PER_ROUTE) {
      times.splice(0, times.length - MAX_RESPONSE_TIMES_PER_ROUTE);
    }
    apiResponseTimes.set(route, times);
  } catch (err) {
    console.warn('[SystemMonitor] recordApiResponseTime failed:', err instanceof Error ? err.message : String(err));
  }
}

export function recordHealingAction(action: string, reason: string) {
  healingActions.push({ action, reason, timestamp: Date.now() });
  if (healingActions.length > MAX_HEALING_STORED) {
    healingActions = healingActions.slice(-MAX_HEALING_STORED);
  }
  console.log(`[SelfHealing] ${action}: ${reason}`);
}

export function registerConnection(id: string, route: string) {
  try {
    activeConnections.add({ id, startTime: Date.now(), route });
  } catch (err) {
    console.warn('[SystemMonitor] registerConnection failed:', err instanceof Error ? err.message : String(err));
  }
}

export function unregisterConnection(id: string) {
  try {
    for (const conn of activeConnections) {
      if (conn.id === id) {
        activeConnections.delete(conn);
        break;
      }
    }
  } catch (err) {
    console.warn('[SystemMonitor] unregisterConnection failed:', err instanceof Error ? err.message : String(err));
  }
}

// ─── Anomaly Detection ────────────────────────────────────────────────

export function detectAnomalies(): string[] {
  const anomalies: string[] = [];
  const now = Date.now();
  const mem = getMemoryUsage();

  // 1. Memory leak detection
  if (mem.percentage > MEMORY_LEAK_THRESHOLD_PERCENT) {
    anomalies.push(`High memory usage: ${mem.percentage}% (threshold: ${MEMORY_LEAK_THRESHOLD_PERCENT}%)`);
  }

  // 2. Memory trend - check if memory is consistently growing
  const recentMetrics = metricsHistory.slice(-10);
  if (recentMetrics.length >= 5) {
    const memoryTrend = recentMetrics.map((m) => m.memoryUsage.percentage);
    let increasing = true;
    for (let i = 1; i < memoryTrend.length; i++) {
      if (memoryTrend[i] < memoryTrend[i - 1]) {
        increasing = false;
        break;
      }
    }
    if (increasing && memoryTrend[memoryTrend.length - 1] > 70) {
      anomalies.push(`Memory leak pattern detected: consistent growth from ${memoryTrend[0]}% to ${memoryTrend[memoryTrend.length - 1]}%`);
    }
  }

  // 3. Error spike detection
  const errorRate = getErrorRate();
  if (errorRate >= ERROR_SPIKE_THRESHOLD) {
    anomalies.push(`Error spike: ${errorRate} errors in the last 5 minutes`);
  }

  // 4. Slow API routes
  for (const [route, times] of apiResponseTimes.entries()) {
    if (times.length >= 5) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      if (avgTime > 10000) {
        anomalies.push(`Slow API route ${route}: average ${Math.round(avgTime)}ms`);
      }
    }
  }

  // 5. Stuck connections
  const stuckConnections = Array.from(activeConnections).filter(
    (c) => now - c.startTime > STUCK_CONNECTION_TIMEOUT_MS
  );
  if (stuckConnections.length > 0) {
    anomalies.push(`${stuckConnections.length} stuck connections detected (>${Math.round(STUCK_CONNECTION_TIMEOUT_MS / 1000)}s)`);
  }

  return anomalies;
}

// ─── Self-Healing ─────────────────────────────────────────────────────

export function performSelfHealing(trigger: string, detail: string) {
  try {
    const now = Date.now();

    // Don't heal too frequently - at most once per 30 seconds
    const recentHealing = healingActions.filter(
      (h) => now - h.timestamp < 30_000
    );
    if (recentHealing.length > 3) {
      return; // Already healing frequently
    }

    switch (trigger) {
      case 'error_spike':
        // Reset ZAI SDK client on error spikes
        resetZAIClient(`Error spike detected: ${detail}`);
        // Clean up stuck connections
        clearStuckConnections();
        break;

      case 'memory_pressure':
        // Clear old metrics and caches
        metricsHistory = [];
        // Trim response times
        for (const [route, times] of apiResponseTimes.entries()) {
          if (times.length > 20) {
            apiResponseTimes.set(route, times.slice(-20));
          }
        }
        // Clear old errors
        errors = errors.slice(-50);
        recordHealingAction('clear_caches', `Memory pressure: ${detail}`);
        // Force garbage collection if available
        if (globalThis.gc) {
          try {
            globalThis.gc();
            recordHealingAction('force_gc', `Memory pressure: ${detail}`);
          } catch (gcErr) {
            console.warn('[SystemMonitor] gc() failed:', gcErr instanceof Error ? gcErr.message : String(gcErr));
          }
        }
        break;

      case 'sdk_error':
        resetZAIClient(`SDK error: ${detail}`);
        break;

      case 'stuck_connections':
        clearStuckConnections();
        break;

      default:
        recordHealingAction('unknown_trigger', `${trigger}: ${detail}`);
    }
  } catch (err) {
    console.warn('[SystemMonitor] performSelfHealing failed:', err instanceof Error ? err.message : String(err));
  }
}

function clearStuckConnections() {
  const now = Date.now();
  let cleared = 0;
  for (const conn of activeConnections) {
    if (now - conn.startTime > STUCK_CONNECTION_TIMEOUT_MS) {
      activeConnections.delete(conn);
      cleared++;
    }
  }
  if (cleared > 0) {
    recordHealingAction('clear_stuck_connections', `Cleared ${cleared} stuck connections`);
  }
}

// ─── Health Check ─────────────────────────────────────────────────────

export function getHealthCheck(): HealthCheckResult {
  cleanOldRecords();
  const mem = getMemoryUsage();
  const errorRate = getErrorRate();
  const anomalies = detectAnomalies();
  const now = Date.now();
  const recentErrors = errors.filter((e) => now - e.timestamp < ERROR_RATE_WINDOW_MS).length;

  let status: HealthCheckResult['status'] = 'healthy';
  const details: string[] = [];

  if (mem.percentage > 90 || errorRate > 20) {
    status = 'unhealthy';
    details.push(...anomalies);
  } else if (mem.percentage > MEMORY_LEAK_THRESHOLD_PERCENT || errorRate > ERROR_SPIKE_THRESHOLD || anomalies.length > 0) {
    status = 'degraded';
    details.push(...anomalies);
  }

  // Check ZAI SDK client status
  if (!globalThis._zaiClient) {
    details.push('ZAI SDK client not initialized (will be created on next request)');
  }

  return {
    status,
    uptime: now - startTime,
    memory: {
      usedMB: Math.round(mem.used / 1024 / 1024),
      totalMB: Math.round(mem.total / 1024 / 1024),
      percentage: mem.percentage,
    },
    activeConnections: activeConnections.size,
    errorRate,
    recentErrors,
    healingActions: healingActions.filter((h) => now - h.timestamp < ERROR_RATE_WINDOW_MS).length,
    details,
  };
}

// ─── Full Metrics Snapshot ────────────────────────────────────────────

export function getMetricsSnapshot(): SystemMetrics {
  cleanOldRecords();

  const snapshot: SystemMetrics = {
    timestamp: Date.now(),
    memoryUsage: getMemoryUsage(),
    activeConnections: activeConnections.size,
    errorRate: getErrorRate(),
    apiResponseTimes: Object.fromEntries(apiResponseTimes),
    errors: errors.slice(-50), // Last 50 errors
    healingActions: healingActions.slice(-20), // Last 20 healing actions
  };

  // Store in history
  metricsHistory.push(snapshot);
  if (metricsHistory.length > 60) {
    metricsHistory = metricsHistory.slice(-60);
  }

  // Auto-heal memory pressure
  if (snapshot.memoryUsage.percentage > MEMORY_LEAK_THRESHOLD_PERCENT) {
    performSelfHealing('memory_pressure', `Memory at ${snapshot.memoryUsage.percentage}%`);
  }

  // Auto-heal stuck connections
  const now = Date.now();
  const stuck = Array.from(activeConnections).filter(
    (c) => now - c.startTime > STUCK_CONNECTION_TIMEOUT_MS
  );
  if (stuck.length > 0) {
    performSelfHealing('stuck_connections', `${stuck.length} stuck connections`);
  }

  return snapshot;
}

// ─── Stats Summary ────────────────────────────────────────────────────

export function getStatsSummary() {
  const now = Date.now();
  const mem = getMemoryUsage();

  // Calculate average response times per route
  const avgResponseTimes: Record<string, { avg: number; min: number; max: number; count: number }> = {};
  for (const [route, times] of apiResponseTimes.entries()) {
    if (times.length === 0) continue;
    avgResponseTimes[route] = {
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      min: Math.round(Math.min(...times)),
      max: Math.round(Math.max(...times)),
      count: times.length,
    };
  }

  // Error breakdown by route
  const errorsByRoute: Record<string, number> = {};
  const recentErrors = errors.filter((e) => now - e.timestamp < ERROR_RATE_WINDOW_MS);
  for (const err of recentErrors) {
    errorsByRoute[err.route] = (errorsByRoute[err.route] || 0) + 1;
  }

  return {
    uptime: now - startTime,
    uptimeFormatted: formatUptime(now - startTime),
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) + '%' : '0%',
    memory: {
      usedMB: Math.round(mem.used / 1024 / 1024),
      totalMB: Math.round(mem.total / 1024 / 1024),
      percentage: mem.percentage,
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    activeConnections: activeConnections.size,
    recentErrorCount: recentErrors.length,
    avgResponseTimes,
    errorsByRoute,
    healingActionCount: healingActions.length,
    recentHealingActions: healingActions.slice(-5),
  };
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

// ─── Periodic Health Check (call this from an API route or cron) ──────

export function runPeriodicHealthCheck() {
  const anomalies = detectAnomalies();
  const mem = getMemoryUsage();

  // Auto-heal based on anomalies
  for (const anomaly of anomalies) {
    if (anomaly.includes('Memory')) {
      performSelfHealing('memory_pressure', anomaly);
    } else if (anomaly.includes('Error spike')) {
      performSelfHealing('error_spike', anomaly);
    } else if (anomaly.includes('stuck connections')) {
      performSelfHealing('stuck_connections', anomaly);
    }
  }

  return {
    checkedAt: Date.now(),
    anomalies,
    memoryPercentage: mem.percentage,
    healingActionsPerformed: healingActions.filter(
      (h) => Date.now() - h.timestamp < 60_000
    ).length,
  };
}
