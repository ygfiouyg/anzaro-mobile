// ═══════════════════════════════════════════════════════════
// Aggregator Reporter — Lightweight telemetry wrapper
// ═══════════════════════════════════════════════════════════
// Wraps reportEndpointSuccess/Failure with error suppression
// so aggregator issues never break user requests.
// ═══════════════════════════════════════════════════════════

import type { ApiCategory } from './types';

/**
 * Report a provider success to the aggregator pool.
 * Non-blocking — errors are silently logged and never propagated.
 * Runs in background (fire-and-forget) so it doesn't add latency.
 */
export function reportSuccess(provider: string, category: ApiCategory, responseMs: number): void {
  // Fire and forget — don't block the user's request
  import('./init').then(({ reportEndpointSuccess }) => {
    reportEndpointSuccess(provider, category, responseMs).catch((err: any) => {
      console.warn('[AggregatorReporter] Failed to report success:', err?.message || err);
    });
  }).catch(() => {
    // Dynamic import failed — aggregator module might not be available
  });
}

/**
 * Report a provider failure to the aggregator pool.
 * Non-blocking — errors are silently logged and never propagated.
 * Runs in background (fire-and-forget) so it doesn't add latency.
 */
export function reportFailure(provider: string, category: ApiCategory, error: string): void {
  // Fire and forget — don't block the user's request
  import('./init').then(({ reportEndpointFailure }) => {
    reportEndpointFailure(provider, category, error).catch((err: any) => {
      console.warn('[AggregatorReporter] Failed to report failure:', err?.message || err);
    });
  }).catch(() => {
    // Dynamic import failed — aggregator module might not be available
  });
}
