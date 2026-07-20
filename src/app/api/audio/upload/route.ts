import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * V.32: Upload Endpoint — accepts chunks, saves to disk, returns 202 IMMEDIATELY.
 * NO processing here — just save chunks and return fast.
 *
 * When the last chunk arrives:
 * 1. Save the merged file path to DB
 * 2. Return 202 with recordId
 * 3. Frontend calls /api/audio/process to start processing
 */
export const maxDuration = 60;

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

    // Chunked upload
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
      console.error(`[Upload] Chunk ${currentChunk}/${total} saved (${(chunkBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

      // Last chunk? Create DB record + return 202 — NO processing!
      if (currentChunk === total) {
        const record = await db.audioRecord.create({
          data: {
            userId: user.id,
            filename,
            fileSize: 0, // will be updated by process endpoint
            duration: 0,
            mimeType,
            status: 'pending',
            progress: 0,
            chunksCount: 0,
            storagePath: tmpFile, // save path so process endpoint can read it
          },
        });

        console.error(`[Upload] All chunks received. Record: ${record.id}. Path: ${tmpFile}`);
        return NextResponse.json({
          id: record.id,
          status: 'pending',
          message: 'تم الرفع. اضغط "بدء التحليل" للمعالجة',
        }, { status: 202 });
      }

      return NextResponse.json({ status: 'uploading', chunk: currentChunk, total });
    }

    // Single file upload (under 10MB)
    const validExts = ['mp3','wav','m4a','mp4','ogg','aac','webm','flac','opus','wma'];
    if (!validExts.includes(ext)) return NextResponse.json({ error: 'نوع غير مدعوم' }, { status: 400 });

    const tmpDir = join(tmpdir(), 'anzaro-uploads');
    mkdirSync(tmpDir, { recursive: true });
    const uploadId = `single-${Date.now()}`;
    const tmpFile = join(tmpDir, `${uploadId}.bin`);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tmpFile, buffer);

    const record = await db.audioRecord.create({
      data: {
        userId: user.id,
        filename,
        fileSize: file.size,
        duration: 0,
        mimeType,
        status: 'pending',
        progress: 0,
        chunksCount: 0,
        storagePath: tmpFile,
      },
    });

    return NextResponse.json({
      id: record.id,
      status: 'pending',
      message: 'تم الرفع. اضغط "بدء التحليل" للمعالجة',
    }, { status: 202 });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'حدث خطأ' }, { status: 500 });
  }
}
