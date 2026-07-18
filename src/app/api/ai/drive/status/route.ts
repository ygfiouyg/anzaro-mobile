// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Google Drive Connection Status API Route
// ═══════════════════════════════════════════════════════════════════════
// GET /api/ai/drive/status
// Returns: { connected, folderId, fileCount, serviceAccount, error? }
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { listDriveFiles } from '@/lib/google-drive.service';
import { getEmbeddedServiceAccount } from '@/lib/google-drive-credentials';

// Cache the status for 2 minutes to avoid hammering the Drive API
let cachedStatus: {
  connected: boolean;
  folderId: string;
  fileCount: number;
  serviceAccount: string;
  error?: string;
  timestamp: number;
} | null = null;

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export async function GET() {
  try {
    // Return cached status if fresh
    if (cachedStatus && Date.now() - cachedStatus.timestamp < CACHE_TTL) {
      return NextResponse.json(cachedStatus);
    }

    // SECURITY: No hardcoded folder ID — must be set via GD_FOLDER_ID env var
    const folderId = process.env.GD_FOLDER_ID || '';

    // Check if service account is configured (env vars OR embedded credentials)
    const embeddedSA = getEmbeddedServiceAccount();
    const hasSAJson = !!(process.env.GD_SERVICE_ACCOUNT_JSON);
    const hasSAPath = !!(process.env.GD_SERVICE_ACCOUNT_PATH);
    const hasEmbeddedSA = !!embeddedSA;
    const hasWriteSAJson = !!(process.env.GD_WRITE_SA_JSON);
    const hasWriteSAPath = !!(process.env.GD_WRITE_SA_PATH);

    if (!hasSAJson && !hasSAPath && !hasEmbeddedSA) {
      const status = {
        connected: false,
        folderId,
        fileCount: 0,
        serviceAccount: 'غير مُعد',
        error: 'لم يتم تكوين حساب خدمة Google Drive (GD_SERVICE_ACCOUNT_JSON أو GD_SERVICE_ACCOUNT_PATH)',
        timestamp: Date.now(),
      };
      cachedStatus = status;
      return NextResponse.json(status);
    }

    // Try to list files to verify connection
    let serviceAccount = 'مُعد';
    if (hasSAJson) {
      try {
        const sa = JSON.parse(process.env.GD_SERVICE_ACCOUNT_JSON!);
        serviceAccount = sa.client_email || 'JSON key (no email)';
      } catch {
        serviceAccount = 'JSON key (invalid)';
      }
    } else if (hasSAPath) {
      serviceAccount = `File: ${process.env.GD_SERVICE_ACCOUNT_PATH}`;
    } else if (hasEmbeddedSA && embeddedSA) {
      serviceAccount = embeddedSA.client_email;
    }

    try {
      const files = await listDriveFiles(50);

      const status = {
        connected: true,
        folderId,
        fileCount: files.length,
        serviceAccount,
        hasWriteAccess: hasWriteSAJson || hasWriteSAPath,
        timestamp: Date.now(),
      };
      cachedStatus = status;
      return NextResponse.json(status);
    } catch (driveError) {
      const errorMsg = driveError instanceof Error ? driveError.message : String(driveError);
      const status = {
        connected: false,
        folderId,
        fileCount: 0,
        serviceAccount,
        error: `فشل الاتصال بـ Google Drive: ${errorMsg}`,
        timestamp: Date.now(),
      };
      cachedStatus = status;
      return NextResponse.json(status);
    }
  } catch (error) {
    console.error('[Drive Status API] Error:', error);
    return NextResponse.json(
      {
        connected: false,
        folderId: process.env.GD_FOLDER_ID || '',
        fileCount: 0,
        serviceAccount: 'خطأ',
        error: 'حدث خطأ أثناء فحص حالة الاتصال',
      },
      { status: 500 }
    );
  }
}
// recompile trigger: Sun Jul 12 23:08:18 UTC 2026
