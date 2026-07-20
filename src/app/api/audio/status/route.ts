import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('id');
    if (recordId) {
      const record = await db.audioRecord.findFirst({ where: { id: recordId, userId: user.id } });
      if (!record) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
      return NextResponse.json({ id: record.id, filename: record.filename, status: record.status, progress: record.progress, transcript: record.transcript, language: record.language, duration: record.duration, chunksCount: record.chunksCount, processedChunks: record.processedChunks, errorMessage: record.errorMessage });
    }
    const records = await db.audioRecord.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, filename: true, status: true, progress: true, duration: true, language: true, chunksCount: true, processedChunks: true, createdAt: true } });
    return NextResponse.json({ records });
  } catch { return NextResponse.json({ error: 'خطأ' }, { status: 500 }); }
}
