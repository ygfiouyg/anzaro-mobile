import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { transcribeAudioFile, estimateDuration } from '@/lib/audio/transcription-pipeline';
import { writeFileSync, readFileSync, mkdirSync, unlinkSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('audio') as File | null;
    if (!file) return NextResponse.json({ error: 'لم يتم رفع ملف' }, { status: 400 });

    const chunkIndex = formData.get('chunkIndex') as string | null;
    const totalChunks = formData.get('totalChunks') as string | null;
    const uploadId = formData.get('uploadId') as string | null;
    const filename = (formData.get('filename') as string) || file.name;
    const mimeType = (formData.get('mimeType') as string) || file.type || 'audio/mpeg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'm4a';

    // Chunked upload: append chunks to a temp file
    if (chunkIndex !== null && totalChunks !== null && uploadId) {
      const tmpDir = join(tmpdir(), 'anzaro-uploads');
      mkdirSync(tmpDir, { recursive: true });
      const tmpFile = join(tmpDir, `${uploadId}.bin`);

      const chunkBuffer = Buffer.from(await file.arrayBuffer());

      if (chunkIndex === '0') {
        writeFileSync(tmpFile, chunkBuffer);
      } else {
        appendFileSync(tmpFile, chunkBuffer);
      }

      const currentChunk = parseInt(chunkIndex) + 1;
      const total = parseInt(totalChunks);
      console.error(`[Audio] Chunk ${currentChunk}/${total} received (${(chunkBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

      // Last chunk? Process the full file
      if (currentChunk === total) {
        const fullBuffer = readFileSync(tmpFile);
        const fileSize = fullBuffer.length;
        const duration = estimateDuration(fileSize, mimeType);

        console.error(`[Audio] All chunks received. Total: ${(fileSize / 1024 / 1024).toFixed(1)}MB. Processing with ffmpeg + Whisper...`);

        // Create DB record
        const record = await db.audioRecord.create({
          data: { userId: user.id, filename, fileSize, duration, mimeType, status: 'processing', progress: 0, chunksCount: 0 },
        });

        try {
          const result = await transcribeAudioFile(fullBuffer, mimeType, async (p, t) => {
            await db.audioRecord.update({ where: { id: record.id }, data: { progress: Math.round((p / t) * 100), processedChunks: p, chunksCount: t } }).catch(() => {});
          });

          // DELETE from DB — privacy
          await db.audioRecord.delete({ where: { id: record.id } }).catch(() => {});
          try { unlinkSync(tmpFile); } catch {}

          console.error(`[Audio] Done: ${result.text.length} chars`);
          return NextResponse.json({
            status: 'transcribed', progress: 100,
            transcript: result.text, language: result.language,
            duration, filename,
          });
        } catch (err) {
          await db.audioRecord.delete({ where: { id: record.id } }).catch(() => {});
          try { unlinkSync(tmpFile); } catch {}
          console.error('[Audio] Failed:', err);
          return NextResponse.json({ error: err instanceof Error ? err.message : 'فشل التحليل' }, { status: 500 });
        }
      }

      return NextResponse.json({ status: 'uploading', chunk: currentChunk, total });
    }

    // Single file upload (under 10MB)
    if (file.size > 500 * 1024 * 1024) return NextResponse.json({ error: 'حجم كبير' }, { status: 400 });
    const validExts = ['mp3','wav','m4a','mp4','ogg','aac','webm','flac','opus','wma'];
    if (!validExts.includes(ext)) return NextResponse.json({ error: 'نوع غير مدعوم' }, { status: 400 });

    const fileSize = file.size;
    const duration = estimateDuration(fileSize, mimeType);
    const buffer = Buffer.from(await file.arrayBuffer());

    const record = await db.audioRecord.create({
      data: { userId: user.id, filename, fileSize, duration, mimeType, status: 'processing', progress: 0, chunksCount: 0 },
    });

    try {
      const result = await transcribeAudioFile(buffer, mimeType, async (p, t) => {
        await db.audioRecord.update({ where: { id: record.id }, data: { progress: Math.round((p / t) * 100), processedChunks: p, chunksCount: t } }).catch(() => {});
      });
      await db.audioRecord.delete({ where: { id: record.id } }).catch(() => {});
      return NextResponse.json({ status: 'transcribed', progress: 100, transcript: result.text, language: result.language, duration, filename });
    } catch (err) {
      await db.audioRecord.delete({ where: { id: record.id } }).catch(() => {});
      return NextResponse.json({ error: err instanceof Error ? err.message : 'فشل' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Audio] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'حدث خطأ' }, { status: 500 });
  }
}
