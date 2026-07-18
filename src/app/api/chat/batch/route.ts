import { NextRequest } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { processBatch, type BatchFileInput, type BatchProgressCallback } from '@/lib/batch-processor';

// ─── Route Configuration ────────────────────────────────────────────
// Allow large request bodies for batch PDF processing
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
// NOTE: old `export const config = { api: { bodyParser: { sizeLimit: '50mb' } } }`
// removed — Pages Router concept, ignored in App Router (caused deprecation warning).

// ─── POST Handler — Start Batch Processing with SSE Progress ─────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, model, language } = body as {
      files: BatchFileInput[];
      model?: string;
      language?: string;
    };

    // Validate files
    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'يجب إرفاق ملف واحد على الأقل' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (files.length > 12) {
      return new Response(
        JSON.stringify({ error: 'الحد الأقصى 12 ملف في المرة الواحدة' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate each file
    for (const file of files) {
      if (!file.name || !file.type) {
        return new Response(
          JSON.stringify({ error: `ملف غير صالح: ${file.name || 'مجهول'}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Optional auth
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    // If auth required, uncomment:
    // if (!user) {
    //   return new Response(
    //     JSON.stringify({ error: 'يجب تسجيل الدخول أولاً' }),
    //     { status: 401, headers: { 'Content-Type': 'application/json' } }
    //   );
    // }

    const resolvedLanguage = language || 'ar';

    // ── Stream Response with SSE Progress ──
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Progress callback — sends SSE events
        const onProgress: BatchProgressCallback = (
          stage,
          detail,
          current,
          total,
          partialResult
        ) => {
          if (streamClosed) return;

          try {
            const event: Record<string, unknown> = {
              stage,
              detail,
              current,
              total,
            };

            if (partialResult) {
              event.partialResult = partialResult;
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            // Controller may be closed
          }
        };

        try {
          // Start batch processing
          const job = await processBatch(files, {
            model,
            language: resolvedLanguage,
            maxConcurrent: 3, // FIX #3: Reduced from 4 to 3 to reduce memory/timeout pressure
            onProgress,
          });

          if (!streamClosed) {
            // Send final result
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  stage: 'completed',
                  detail: `تم التحليل الشامل لـ ${files.length} ملفات`,
                  current: files.length,
                  total: files.length,
                  results: job.results,
                  crossAnalysis: job.crossAnalysis,
                  status: job.status,
                  // FIX #3: Include error info if partially failed
                  ...(job.status === 'failed' && job.error ? { error: job.error } : {}),
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
              // FIX #3: Include actual error details instead of generic message
              const errorDetail = error instanceof Error ? error.message : 'حدث خطأ أثناء معالجة الدفعة';
              console.error('[BatchAPI] Batch processing failed:', errorDetail);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    stage: 'failed',
                    detail: errorDetail,
                    status: 'failed',
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
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[BatchAPI] Error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ غير متوقع أثناء معالجة الدفعة' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
