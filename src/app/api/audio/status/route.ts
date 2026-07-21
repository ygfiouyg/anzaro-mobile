import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * V.32: Status Endpoint — lightweight polling.
 * Returns current status + transcript (if completed).
 * Auto-deletes DB record after transcript is delivered.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('id');

    if (recordId) {
      const record = await db.audioRecord.findFirst({
        where: { id: recordId, userId: user.id },
      });

      if (!record) return NextResponse.json({ error: 'غير موجود', status: 'not_found' }, { status: 404 });

      const response: Record<string, unknown> = {
        id: record.id,
        filename: record.filename,
        status: record.status,
        progress: record.progress,
        duration: record.duration,
        chunksCount: record.chunksCount,
        processedChunks: record.processedChunks,
        language: record.language,
        errorMessage: record.errorMessage,
      };

      // V.33: Return transcript when completed OR when failed with partial work.
      // V.36c: Only auto-delete 'completed' records. 'failed' records are kept
      // so they can be resumed (the process endpoint can continue from the last
      // completed segment). The frontend polls status to get partial transcripts,
      // and only the final 'completed' record is deleted after delivery.
      if (record.status === 'completed' && record.transcript) {
        response.transcript = record.transcript;
        // Auto-delete after delivery (privacy — audio/transcript not stored permanently)
        await db.audioRecord.delete({ where: { id: record.id } }).catch(() => {});
      } else if (record.status === 'failed' && record.transcript) {
        // Return partial transcript but DON'T delete — allow resume
        response.transcript = record.transcript;
      }

      return NextResponse.json(response);
    }

    const records = await db.audioRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, filename: true, status: true, progress: true, duration: true, chunksCount: true, processedChunks: true, createdAt: true },
    });

    return NextResponse.json({ records });
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 });
  }
}
