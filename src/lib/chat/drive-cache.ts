// ─── Drive Connection Cache ────────────────────────────────────────────
// Cache Drive connection status and file list to avoid checking on every message
// (each check takes ~330ms, which adds significant latency)

import { checkDriveConnection, listDriveFiles, type DriveFile } from '@/lib/google-drive.service';

export interface DriveCacheEntry {
  connected: boolean;
  fileList: DriveFile[];
  timestamp: number;
}

let driveCache: DriveCacheEntry | null = null;
export const DRIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedDriveStatus(): Promise<{ connected: boolean; fileList: DriveFile[] }> {
  const now = Date.now();
  if (driveCache && (now - driveCache.timestamp) < DRIVE_CACHE_TTL_MS) {
    // Background refresh: if cache is within 1 minute of expiring, refresh in background
    if (driveCache.connected && (now - driveCache.timestamp) > (DRIVE_CACHE_TTL_MS - 60_000)) {
      // Fire and forget — don't await
      (async () => {
        try {
          const connected = await checkDriveConnection();
          if (connected) {
            const fileList = await listDriveFiles();
            driveCache = { connected: true, fileList, timestamp: Date.now() };
            console.log('[Chat] Drive cache refreshed in background');
          }
        } catch { /* background refresh failed, existing cache still valid */ }
      })();
    }
    return { connected: driveCache.connected, fileList: driveCache.fileList };
  }
  // Try to check Drive connection — cache the result
  try {
    const connected = await checkDriveConnection();
    if (connected) {
      const fileList = await listDriveFiles();
      driveCache = { connected: true, fileList, timestamp: now };
      return { connected: true, fileList };
    }
  } catch {
    // Drive not configured or unavailable
  }
  // Cache the disconnected state too (but with shorter TTL — 1 minute)
  driveCache = { connected: false, fileList: [], timestamp: now - DRIVE_CACHE_TTL_MS + 60_000 };
  return { connected: false, fileList: [] };
}
