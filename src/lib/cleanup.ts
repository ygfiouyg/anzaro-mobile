// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Session, OTP & File Cleanup Job
// ═══════════════════════════════════════════════════════════════════════
// Periodically cleans up:
//   1. Expired sessions and OTP codes
//   2. Old generated files (PDF, images, etc.) and their DB records
// Runs every hour via setInterval.
// ═══════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Age threshold for generated files: 7 days */
const FILE_MAX_AGE_DAYS = 7;
/** Maximum number of files to delete per cleanup run (safety limit) */
const MAX_FILES_PER_RUN = 200;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startCleanupJob() {
  if (cleanupTimer) return; // Already running

  // Run immediately on start
  performCleanup();

  // Then schedule periodic cleanup
  cleanupTimer = setInterval(performCleanup, CLEANUP_INTERVAL_MS);

  console.log('[Cleanup] Session, OTP & File cleanup job started (every 1 hour)');
}

async function performCleanup() {
  try {
    await cleanupExpiredSessions();
    await cleanupOldFiles();
  } catch (error) {
    console.error('[Cleanup] Error during cleanup:', error);
  }
}

async function cleanupExpiredSessions() {
  try {
    const now = new Date();

    // Delete expired sessions
    const expiredSessions = await db.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // Delete expired OTP codes
    const expiredOtps = await db.otpCode.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // Delete used OTP codes older than 1 hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const usedOtps = await db.otpCode.deleteMany({
      where: { isUsed: true, createdAt: { lt: oneHourAgo } },
    });

    if (expiredSessions.count > 0 || expiredOtps.count > 0 || usedOtps.count > 0) {
      console.log(
        `[Cleanup] Removed: ${expiredSessions.count} expired sessions, ${expiredOtps.count} expired OTPs, ${usedOtps.count} used OTPs`
      );
    }
  } catch (error) {
    console.error('[Cleanup] Error during session cleanup:', error);
  }
}

async function cleanupOldFiles() {
  try {
    const cutoffDate = new Date(Date.now() - FILE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    // Find old generative assets
    const oldAssets = await db.generativeAsset.findMany({
      where: { createdAt: { lt: cutoffDate } },
      select: { id: true, filePath: true, type: true },
      take: MAX_FILES_PER_RUN,
    });

    if (oldAssets.length === 0) return;

    let deletedFromDisk = 0;
    let deletedFromDb = 0;
    let diskErrors = 0;

    // Delete files from disk
    for (const asset of oldAssets) {
      try {
        if (asset.filePath && existsSync(asset.filePath)) {
          await unlink(asset.filePath);
          deletedFromDisk++;
        }
      } catch (fileErr) {
        // File may already be deleted or inaccessible — log and continue
        diskErrors++;
        console.warn(`[Cleanup] Could not delete file: ${asset.filePath}`, fileErr instanceof Error ? fileErr.message : String(fileErr));
      }
    }

    // Delete DB records in batch
    try {
      const idsToDelete = oldAssets.map((a) => a.id);
      const result = await db.generativeAsset.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      deletedFromDb = result.count;
    } catch (dbErr) {
      console.error('[Cleanup] Error deleting generative asset records:', dbErr);
    }

    console.log(
      `[Cleanup] File cleanup: ${deletedFromDisk} files deleted from disk, ${deletedFromDb} DB records removed, ${diskErrors} disk errors (cutoff: ${FILE_MAX_AGE_DAYS} days)`
    );
  } catch (error) {
    console.error('[Cleanup] Error during file cleanup:', error);
  }
}

/**
 * Manually delete a specific generative asset and its file from disk.
 * Used by the file delete API endpoint.
 */
export async function deleteGenerativeAsset(assetId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the asset and verify ownership
    const asset = await db.generativeAsset.findFirst({
      where: { id: assetId, userId },
    });

    if (!asset) {
      return { success: false, error: 'الأصل غير موجود أو غير مملوك لك' };
    }

    // Delete file from disk
    if (asset.filePath) {
      try {
        if (existsSync(asset.filePath)) {
          await unlink(asset.filePath);
        }
      } catch (fileErr) {
        console.warn(`[Cleanup] Could not delete file: ${asset.filePath}`, fileErr instanceof Error ? fileErr.message : String(fileErr));
        // Continue to delete DB record even if file deletion fails
      }
    }

    // Delete DB record
    await db.generativeAsset.delete({
      where: { id: assetId },
    });

    return { success: true };
  } catch (error) {
    console.error('[Cleanup] Error deleting asset:', error);
    return { success: false, error: 'فشل في حذف الأصل' };
  }
}
