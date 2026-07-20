import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { transcribeAudioFile, estimateDuration } from '@/lib/audio/transcription-pipeline';
import { readFileSync, existsSync, unlinkSync } from 'fs';

/**
 * V.32: Process Endpoint — called by frontend AFTER upload completes.
 * This endpoint does the heavy lifting: ffmpeg + Whisper.
 * It has its own long timeout (600s) and is a separate HTTP request
 * from the upload, so it won't block the upload response.
 *
 * Flow:
 * 1. Frontend uploads chunks → gets recordId (202)
 * 2. Frontend calls POST /api/audio/process?id=recordId
 * 3. This endpoint reads the temp file, runs ffmpeg + Whisper
 * 4. Returns the transcript directly (no polling needed for single segment)
 *    OR returns "processing" for multi-segment (frontend polls /api/audio/status)
 */
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('id');
    if (!recordId) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const record = await db.audioRecord.findFirst({
      where: { id: recordId, userId: user.id },
    });
    if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    if (record.status === 'processing') return NextResponse.json({ error: 'Already processing' }, { status: 409 });

    // Check file exists
    if (!record.storagePath || !existsSync(record.storagePath)) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    // Update status to processing
    await db.audioRecord.update({
      where: { id: recordId },
      data: { status: 'processing', progress: 0 },
    });

    console.error(`[Process] Starting for record ${recordId}, file: ${record.storagePath}`);

    // Read the audio file
    const audioBuffer = readFileSync(record.storagePath);
    const fileSize = audioBuffer.length;
    const duration = estimateDuration(fileSize, record.mimeType);

    await db.audioRecord.update({
      where: { id: recordId },
      data: { fileSize, duration },
    });

    // Run the full pipeline: ffmpeg + Whisper
    const result = await transcribeAudioFile(audioBuffer, record.mimeType, recordId, async (p, t, text) => {
      await db.audioRecord.update({
        where: { id: recordId },
        data: { progress: Math.round((p / t) * 100), processedChunks: p, chunksCount: t },
      }).catch(() => {});
    });

    // Save transcript to DB
    await db.audioRecord.update({
      where: { id: recordId },
      data: {
        status: 'completed',
        progress: 100,
        transcript: result.text,
        language: result.language,
        processedChunks: result.chunks.length,
        chunksCount: result.chunks.length,
      },
    });

    // Delete the temp audio file (privacy — audio not stored)
    try { unlinkSync(record.storagePath); } catch {}

    console.error(`[Process] Done! ${result.text.length} chars via ${result.provider}`);

    return NextResponse.json({
      status: 'completed',
      progress: 100,
      transcript: result.text,
      language: result.language,
      duration,
      provider: result.provider,
      filename: record.filename,
    });
  } catch (error) {
    console.error('[Process] Error:', error);

    // Try to update DB status to failed
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('id');
    if (recordId) {
      await db.audioRecord.update({
        where: { id: recordId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Processing failed',
    }, { status: 500 });
  }
}
