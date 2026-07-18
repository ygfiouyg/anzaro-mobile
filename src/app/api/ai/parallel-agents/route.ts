import { NextRequest } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { processFilesWithParallelAgents, type AgentFileInput, type ParallelAgentProgressCallback } from '@/lib/parallel-agent-engine';

// ─── Convert chat store file format to engine format ────────────────────
function convertFilesToEngineFormat(rawFiles: Array<{ name: string; content: string; type: string }>): AgentFileInput[] {
  return rawFiles.map((f) => {
    // Detect MIME type from content (data URL) or file extension
    let mimeType = 'application/octet-stream';
    if (f.content.startsWith('data:')) {
      const mimeMatch = f.content.match(/^data:([^;]+);base64,/);
      if (mimeMatch) mimeType = mimeMatch[1];
    }

    // Map file type to MIME type if not detected
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const typeToMime: Record<string, string> = {
      image: 'image/png',
      video: 'video/mp4',
      audio: 'audio/wav',
      pdf: 'application/pdf',
      text: 'text/plain',
    };
    if (mimeType === 'application/octet-stream' && typeToMime[f.type]) {
      mimeType = typeToMime[f.type];
    }

    // Map file type to engine type
    const typeMap: Record<string, 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'data'> = {
      image: 'image',
      video: 'video',
      audio: 'audio',
      pdf: 'pdf',
      text: 'text',
      other: 'text',
    };

    return {
      name: f.name,
      content: f.content,
      mimeType,
      type: typeMap[f.type] || 'text',
    };
  });
}

// ─── Increase body size limit for large file uploads (100MB) ───────────
export const maxDuration = 300; // 5 minutes timeout
export const dynamic = 'force-dynamic';

// ─── POST Handler — Parallel Agent Processing with SSE Progress ───────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files: rawFiles, model, language, userPrompt, maxConcurrent } = body as {
      files: Array<{ name: string; content: string; type: string }>;
      model?: string;
      language?: string;
      userPrompt?: string;
      maxConcurrent?: number;
    };

    // Convert files to engine format
    const files = convertFilesToEngineFormat(rawFiles || []);

    // Validate files
    if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'يجب إرفاق ملف واحد على الأقل' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (rawFiles.length > 12) {
      return new Response(
        JSON.stringify({ error: 'الحد الأقصى 12 ملف في المرة الواحدة' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Optional auth
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    // Auth is optional for parallel agents

    const resolvedLanguage = language || 'ar';
    const resolvedMaxConcurrent = Math.min(Math.max(maxConcurrent || 6, 1), 6);

    // ── Stream Response with SSE Progress ──
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Progress callback — sends SSE events
        const onProgress: ParallelAgentProgressCallback = (progress) => {
          if (streamClosed) return;

          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
            );
          } catch {
            // Controller may be closed
          }
        };

        try {
          // Start parallel agent processing
          const result = await processFilesWithParallelAgents(files, {
            model,
            language: resolvedLanguage,
            maxConcurrent: resolvedMaxConcurrent,
            userPrompt: userPrompt || '',
            onProgress,
          });

          if (!streamClosed) {
            // Send final result
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  stage: 'completed',
                  detail: `تم التحليل الشامل لـ ${files.length} ملفات بـ ${result.agentsUsed} وكلاء بالتوازي`,
                  agentsActive: 0,
                  agentsCompleted: result.agentsUsed,
                  agentsTotal: result.agentsUsed,
                  results: result.results,
                  coordinatedAnalysis: result.coordinatedAnalysis,
                  totalProcessingTimeMs: result.totalProcessingTimeMs,
                  agentsUsed: result.agentsUsed,
                  model: result.model,
                })}\n\n`
              )
            );

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            streamClosed = true;
          }
        } catch (error) {
          if (!streamClosed) {
            streamClosed = true;
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    stage: 'failed',
                    detail: 'حدث خطأ أثناء معالجة الوكلاء المتوازيين',
                    agentsActive: 0,
                    agentsCompleted: 0,
                    agentsTotal: files.length,
                  })}\n\n`
                )
              );
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch {
              // Controller already closed
            }
          }
        }
      },
      cancel() {
        streamClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[ParallelAgentAPI] Error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ غير متوقع أثناء معالجة الوكلاء المتوازيين' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
