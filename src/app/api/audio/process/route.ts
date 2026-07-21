import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { transcribeAudioFile, estimateDuration } from '@/lib/audio/transcription-pipeline';
import { readFileSync, existsSync, unlinkSync } from 'fs';

/**
 * V.33: Process Endpoint — SSE STREAMING (prevents HF proxy timeout).
 *
 * CRITICAL FIX: The old V.32 endpoint returned a plain JSON Response after
 * doing ALL the work (ffmpeg + 45 Whisper API calls). For a 44-minute audio
 * file, that's 10+ minutes with ZERO bytes sent → the HuggingFace proxy
 * kills the connection after ~10 seconds of inactivity.
 *
 * V.33 FIX: This endpoint returns an SSE stream IMMEDIATELY (within 100ms),
 * then sends progress events after each segment. The HF proxy sees bytes
 * flowing and keeps the connection alive.
 *
 * SSE event format:
 *   data: {"type":"start","total":45,"recordId":"..."}\n\n
 *   data: {"type":"progress","current":3,"total":45,"progress":6,"text":"..."}\n\n
 *   data: {"type":"done","transcript":"...","language":"ar","provider":"groq"}\n\n
 *   data: {"type":"error","error":"..."}\n\n
 *
 * Resume support: If the process was interrupted (HF proxy timeout, crash),
 * the frontend can call this endpoint again. It reads the partial transcript
 * from the DB and resumes from the last completed segment.
 */
export const maxDuration = 600;
export const dynamic = 'force-dynamic';

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // ── Auth + validation ──
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

  // Check file exists
  if (!record.storagePath || !existsSync(record.storagePath)) {
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }

  // V.33: Resume support — if status is 'processing' with partial work,
  // resume from the last completed segment instead of starting over.
  // The 409 lock is REMOVED to allow resume after timeout/crash.
  const startSegment = record.status === 'processing' && record.processedChunks > 0
    ? record.processedChunks
    : 0;

  // ── Create SSE stream (response starts flowing IMMEDIATELY) ──
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send start event within 100ms (before any heavy work)
        controller.enqueue(encoder.encode(sse({
          type: 'start',
          recordId,
          resume: startSegment > 0,
          startSegment,
          filename: record.filename,
        })));

        // Update status to processing
        await db.audioRecord.update({
          where: { id: recordId },
          data: { status: 'processing', progress: startSegment > 0 ? record.progress : 0 },
        }).catch(() => {});

        console.error(`[Process] Starting for record ${recordId}, startSegment=${startSegment}`);

        // Read the audio file
        const audioBuffer = readFileSync(record.storagePath);
        const fileSize = audioBuffer.length;
        const duration = estimateDuration(fileSize, record.mimeType);

        await db.audioRecord.update({
          where: { id: recordId },
          data: { fileSize, duration },
        }).catch(() => {});

        // Send heartbeat so HF proxy knows we're alive
        controller.enqueue(encoder.encode(sse({ type: 'heartbeat', msg: 'ffmpeg starting...' })));

        // Run the pipeline with SSE progress callback
        const result = await transcribeAudioFile(
          audioBuffer,
          record.mimeType,
          recordId,
          (current, total, segmentText, fullTextSoFar) => {
            // After each segment, send progress event
            controller.enqueue(encoder.encode(sse({
              type: 'progress',
              current,
              total,
              progress: Math.round((current / total) * 100),
              segmentText: segmentText.slice(0, 200), // preview only (save bandwidth)
              fullLength: fullTextSoFar.length,
            })));
          },
          startSegment
        );

        // Save final transcript to DB
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
        }).catch(() => {});

        // Delete the temp audio file (privacy — audio not stored)
        try { unlinkSync(record.storagePath); } catch {}

        console.error(`[Process] Done! ${result.text.length} chars via ${result.provider}`);

        // Send final done event
        controller.enqueue(encoder.encode(sse({
          type: 'done',
          transcript: result.text,
          language: result.language,
          duration,
          provider: result.provider,
          filename: record.filename,
          totalSegments: result.totalSegments,
        })));

      } catch (error) {
        console.error('[Process] Error:', error);
        const errMsg = error instanceof Error ? error.message : 'Processing failed';

        // Update DB status to failed (but keep partial transcript)
        await db.audioRecord.update({
          where: { id: recordId },
          data: { status: 'failed', errorMessage: errMsg },
        }).catch(() => {});

        controller.enqueue(encoder.encode(sse({
          type: 'error',
          error: errMsg,
        })));
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // CRITICAL: disable nginx/proxy buffering
    },
  });
}
