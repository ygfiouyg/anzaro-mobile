// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Disabled Models Utility
// ═══════════════════════════════════════════════════════════════════════
// Shared utility for reading disabled model IDs from the database.
// Used by: /api/ai/hf/models, /api/ai/hf/health, generation APIs, etc.
// ═══════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// In-memory cache to avoid hitting DB on every request
let cachedDisabledIds: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Get the set of disabled model IDs from the database.
 * Results are cached for 1 minute to avoid excessive DB queries.
 */
export async function getDisabledModelIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedDisabledIds && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedDisabledIds;
  }

  try {
    const disabled = await db.hFDisabledModel.findMany({
      select: { modelId: true },
    });
    cachedDisabledIds = new Set(disabled.map(d => d.modelId));
    cacheTimestamp = now;
    return cachedDisabledIds;
  } catch {
    // If DB query fails, return empty set (don't block functionality)
    return cachedDisabledIds || new Set();
  }
}

/**
 * Check if a specific model ID is disabled.
 */
export async function isModelDisabled(modelId: string): Promise<boolean> {
  const disabled = await getDisabledModelIds();
  return disabled.has(modelId);
}

/**
 * Filter out disabled models from a record of models.
 * Returns a new record with disabled models removed.
 */
export function filterDisabledModels<T>(
  models: Record<string, T>,
  disabledIds: Set<string>
): Record<string, T> {
  const filtered: Record<string, T> = {};
  for (const [id, entry] of Object.entries(models)) {
    if (!disabledIds.has(id)) {
      filtered[id] = entry;
    }
  }
  return filtered;
}

/**
 * Invalidate the cache (e.g., after admin disables/enables a model).
 */
export function invalidateDisabledModelsCache(): void {
  cachedDisabledIds = null;
  cacheTimestamp = 0;
}
