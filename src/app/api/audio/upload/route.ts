import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { transcribeAudioFile, estimateDuration } from '@/lib/audio/transcription-pipeline';

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const formData = await request.formData();
    const file = formData.get('audio') as File | null;
    if (!file) return NextResponse.json({ error: 'لم يتم رفع ملف' }, { status: 400 });
    if (file.size > 500 * 1024 * 1024) return NextResponse.json({ error: 'حجم كبير' }, { status: 400 });
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['mp3','wav','m4a','mp4','ogg','aac','webm','flac','opus','wma'];
    if (!validExts.includes(ext || '')) return NextResponse.json({ error: 'نوع غير مدعوم' }, { status: 400 });
    const duration = estimateDuration(file.size, file.type || 'audio/mpeg');
    const record = await db.audioRecord.create({ data: { userId: user.id, filename: file.name, fileSize: file.size, duration, mimeType: file.type || `audio/${ext}`, status: 'processing', progress: 0, chunksCount: Math.max(1, Math.ceil(duration / 300)) } });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (file.size < 50 * 1024 * 1024) {
      try {
        const result = await transcribeAudioFile(buffer, file.type || 'audio/mpeg', async (p, t) => {
          await db.audioRecord.update({ where: { id: record.id }, data: { progress: Math.round((p/t)*100), processedChunks: p } }).catch(() => {});
        });
        await db.audioRecord.update({ where: { id: record.id }, data: { status: 'transcribed', progress: 100, transcript: result.text, language: result.language, processedChunks: result.chunks.length } });
        return NextResponse.json({ id: record.id, status: 'transcribed', progress: 100, transcript: result.text, language: result.language, duration, chunksCount: result.chunks.length });
      } catch (err) {
        await db.audioRecord.update({ where: { id: record.id }, data: { status: 'failed', errorMessage: err instanceof Error ? err.message : 'Unknown' } });
        throw err;
      }
    } else {
      transcribeAudioFile(buffer, file.type || 'audio/mpeg', async (p, t) => {
        await db.audioRecord.update({ where: { id: record.id }, data: { progress: Math.round((p/t)*100), processedChunks: p } }).catch(() => {});
      }).then(async (r) => {
        await db.audioRecord.update({ where: { id: record.id }, data: { status: 'transcribed', progress: 100, transcript: r.text, language: r.language } });
      }).catch(async (e) => {
        await db.audioRecord.update({ where: { id: record.id }, data: { status: 'failed', errorMessage: e instanceof Error ? e.message : 'Unknown' } });
      });
      return NextResponse.json({ id: record.id, status: 'processing', progress: 0, duration, chunksCount: record.chunksCount });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'خطأ' }, { status: 500 });
  }
}
