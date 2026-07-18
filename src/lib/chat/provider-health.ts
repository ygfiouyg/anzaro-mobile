// ─── Provider Health Cache ────────────────────────────────────────────
// Skip providers that failed recently to avoid wasting time on dead providers.
// Each failed provider is skipped for 5 minutes before being retried.

export interface ProviderHealthEntry {
  lastFailure: number;
  failureCount: number;
}

export const providerHealthCache = new Map<string, ProviderHealthEntry>();
export const PROVIDER_SKIP_DURATION = 5 * 60 * 1000; // 5 minutes

export function isProviderHealthy(provider: string): boolean {
  const entry = providerHealthCache.get(provider);
  if (!entry) return true;
  if (Date.now() - entry.lastFailure > PROVIDER_SKIP_DURATION) {
    providerHealthCache.delete(provider);
    return true;
  }
  return false;
}

export function markProviderFailed(provider: string): void {
  const entry = providerHealthCache.get(provider) || { lastFailure: 0, failureCount: 0 };
  entry.lastFailure = Date.now();
  entry.failureCount++;
  providerHealthCache.set(provider, entry);
  console.log(`[Chat] Provider "${provider}" marked unhealthy (failures: ${entry.failureCount}, skip until ${new Date(entry.lastFailure + PROVIDER_SKIP_DURATION).toISOString()})`);
}
