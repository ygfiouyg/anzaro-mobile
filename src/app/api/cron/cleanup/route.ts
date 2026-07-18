import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

// ═══════════════════════════════════════════════════════════════════════
// Cron Cleanup Endpoint — Removes expired sessions, OTP codes, and old files
// Called periodically by the app or external cron service
// Protected by CRON_SECRET environment variable
// ═══════════════════════════════════════════════════════════════════════

/** Age threshold for generated files: 7 days */
const FILE_MAX_AGE_DAYS = 7;
/** Maximum number of files to delete per cleanup run (safety limit) */
const MAX_FILES_PER_RUN = 200;

export async function GET(request: NextRequest) {
  // SECURITY: CRON_SECRET is REQUIRED — reject if not configured
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Cleanup] CRON_SECRET is not set — refusing unauthenticated cleanup requests');
    return NextResponse.json(
      { error: 'CRON_SECRET غير مضبوط — لا يمكن تشغيل التنظيف بدون مصادقة' },
      { status: 403 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const now = new Date();
    const results = {
      expiredSessions: 0,
      expiredOtpCodes: 0,
      oldFilesDeleted: 0,
      oldDbRecordsDeleted: 0,
    };

    // Delete expired sessions
    const deletedSessions = await db.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    results.expiredSessions = deletedSessions.count;

    // Delete expired OTP codes
    const deletedOtps = await db.otpCode.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    results.expiredOtpCodes = deletedOtps.count;

    // ── Cleanup old generated files (older than FILE_MAX_AGE_DAYS) ──
    const cutoffDate = new Date(Date.now() - FILE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    const oldAssets = await db.generativeAsset.findMany({
      where: { createdAt: { lt: cutoffDate } },
      select: { id: true, filePath: true },
      take: MAX_FILES_PER_RUN,
    });

    if (oldAssets.length > 0) {
      // Delete files from disk
      for (const asset of oldAssets) {
        try {
          if (asset.filePath && existsSync(asset.filePath)) {
            await unlink(asset.filePath);
            results.oldFilesDeleted++;
          }
        } catch {
          // File may already be deleted — continue
        }
      }

      // Delete DB records
      const idsToDelete = oldAssets.map((a) => a.id);
      const deletedAssets = await db.generativeAsset.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      results.oldDbRecordsDeleted = deletedAssets.count;
    }

    console.log(`[Cleanup] Removed ${results.expiredSessions} expired sessions, ${results.expiredOtpCodes} expired OTP codes, ${results.oldFilesDeleted} old files, ${results.oldDbRecordsDeleted} old DB records`);

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
