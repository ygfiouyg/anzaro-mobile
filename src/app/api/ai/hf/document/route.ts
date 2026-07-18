// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Document Generation API (v3 — Local PDF Engine)
// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/hf/document — Generate a document (PDF/PPTX/XLSX/DOCX)
//   - mode: 'single' (default) — Generate via HF Gradio Space OR local engine
//   - mode: 'batch'           — Generate batch PDF via local engine
//   - mode: 'local'           — Generate PDF via local engine (reliable)
// GET  /api/ai/hf/document — List available document models
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import {
  generateDocument,
  generateBatchDocument,
  generateLocalDocument,
  getAllDocumentModelIds,
  getDocumentModelById,
  createDocumentTask,
  getDocumentTask,
} from '@/lib/hf-document.service';
import { uploadFileToDrive } from '@/lib/google-drive.service';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // ── FIX: Require authentication for document generation ──
    // Previously had no auth — anyone could generate documents
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    // Allow guests with strict rate limits, authenticated users get more capacity
    const rateLimitResponse = checkRateLimit(
      request,
      user ? { ...RATE_LIMIT_PRESETS.ai, maxRequests: 20 } : { ...RATE_LIMIT_PRESETS.ai, maxRequests: 3 },
      user?.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { mode, modelId, topic, slideCount, language, instructions, template, inputPdfUrl, lectures, channelName, includeImages, includeAiImages, extractDiagrams, styleDescription } = body;
    // Support both includeImages and includeAiImages from frontend
    const shouldIncludeImages = includeImages || includeAiImages || false;

    // ── Batch mode ─────────────────────────────────────────────────────
    if (mode === 'batch') {
      if (!topic) {
        return NextResponse.json(
          { error: 'الموضوع مطلوب لإنشاء مستند دفعي' },
          { status: 400 }
        );
      }

      if (!lectures || !Array.isArray(lectures) || lectures.length === 0) {
        return NextResponse.json(
          { error: 'يجب توفير مصفوفة محاضرات (1-12)' },
          { status: 400 }
        );
      }

      if (lectures.length > 12) {
        return NextResponse.json(
          { error: 'الحد الأقصى 12 محاضرة لكل مستند دفعي' },
          { status: 400 }
        );
      }

      // Validate each lecture has title and content
      for (let i = 0; i < lectures.length; i++) {
        if (!lectures[i].title || !lectures[i].content) {
          return NextResponse.json(
            { error: `المحاضرة ${i + 1} يجب أن تحتوي على عنوان ومحتوى` },
            { status: 400 }
          );
        }
      }

      const result = await generateBatchDocument({
        topic,
        lectures,
        language: language || 'ar',
        channelName: channelName || undefined,
        includeImages: shouldIncludeImages,
        instructions: instructions || undefined,
        styleDescription: styleDescription || undefined,
      });
      let webFileUrl = result.fileUrl;
      if (result.fileUrl && result.fileUrl.includes('/download/')) {
        const fileName = result.fileUrl.split('/download/')[1];
        webFileUrl = `/api/pdf/serve/${fileName}`;
      }

      // Auto-upload to Google Drive in background (non-blocking)
      if (result.fileUrl && result.fileUrl.includes('/download/')) {
        uploadFileToDrive(result.fileUrl, `DeltaAI_${result.fileName}`, result.mimeType)
          .then((r) => {
            if (r.success) console.log(`[Doc] Auto-uploaded to Drive: ${r.fileId}`);
            else console.warn(`[Doc] Drive upload failed:`, r.error);
          })
          .catch(() => {});
      }

      return NextResponse.json({
        success: true,
        mode: 'batch',
        fileUrl: webFileUrl,
        filePath: result.fileUrl, // Keep absolute path for internal use
        fileName: result.fileName,
        mimeType: result.mimeType,
        docType: result.docType,
        model: result.model,
        durationMs: result.durationMs,
        lecturesProcessed: result.lecturesProcessed,
        diagramsExtracted: result.diagrams.length,
        diagrams: extractDiagrams ? result.diagrams : undefined,
      });
    }

    // ── Local PDF mode (reliable, no external APIs) ──────────────────
    if (mode === 'local' || modelId === 'local-pdf') {
      if (!topic) {
        return NextResponse.json(
          { error: 'الموضوع مطلوب لإنشاء المستند' },
          { status: 400 }
        );
      }

      // ── Check if client wants SSE ──
      const acceptHeader = request.headers.get('Accept') || '';
      const wantsSSE = acceptHeader.includes('text/event-stream');

      if (wantsSSE) {
        // ── SSE Response: Create task and stream progress ──
        const taskId = createDocumentTask('local', {
          topic,
          language: language || 'ar',
          instructions: instructions || '',
          channelName: channelName || 'بعقل هادي',
          includeImages: shouldIncludeImages,
          styleDescription: styleDescription || undefined,
        });

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const sendEvent = (event: string, data: unknown) => {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            };

            // Send initial event with taskId
            sendEvent('init', { taskId });

            // Poll task status and send updates
            let lastProgress = -1;
            let lastStage = '';
            const maxPollTime = 10 * 60 * 1000; // 10 min max
            const startTime = Date.now();

            while (Date.now() - startTime < maxPollTime) {
              const task = getDocumentTask(taskId);
              if (!task) {
                sendEvent('error', { error: 'Task not found' });
                break;
              }

              // Only send updates when something changed
              if (task.progress !== lastProgress || task.stage !== lastStage) {
                sendEvent('progress', {
                  stage: task.stage,
                  progress: task.progress,
                  message: task.message || '',
                  status: task.status,
                });
                lastProgress = task.progress;
                lastStage = task.stage;
              }

              if (task.status === 'completed') {
                // Convert absolute file path to web-accessible URL
                let webFileUrl = task.result?.fileUrl;
                if (task.result?.fileUrl && task.result.fileUrl.includes('/download/')) {
                  const fname = task.result.fileUrl.split('/download/')[1];
                  webFileUrl = `/api/pdf/serve/${fname}`;
                }

                // Auto-upload to Google Drive in background (non-blocking)
                if (task.result?.fileUrl && task.result.fileUrl.includes('/download/')) {
                  uploadFileToDrive(task.result.fileUrl, `DeltaAI_${task.result.fileName}`, task.result.mimeType)
                    .then((r) => {
                      if (r.success) console.log(`[Doc] Auto-uploaded to Drive: ${r.fileId}`);
                      else console.warn(`[Doc] Drive upload failed:`, r.error);
                    })
                    .catch(() => {});
                }

                sendEvent('completed', {
                  success: true,
                  fileUrl: webFileUrl,
                  fileName: task.result?.fileName,
                  docType: task.result?.docType,
                  model: task.result?.model,
                  durationMs: task.result?.durationMs,
                });
                break;
              }

              if (task.status === 'failed') {
                sendEvent('error', { error: task.error || 'Document generation failed' });
                break;
              }

              // Wait before next poll
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            // Close the stream
            try {
              controller.close();
            } catch {
              // Stream already closed by client
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Task-Id': taskId,
          },
        });
      }

      // ── Non-SSE: Original JSON response (backward compatible) ──
      const result = await generateLocalDocument({
        topic,
        language: language || 'ar',
        instructions: instructions || '',
        channelName: channelName || 'بعقل هادي',
        includeImages: shouldIncludeImages,
        styleDescription: styleDescription || undefined,
      });

      // Convert absolute file path to web-accessible URL
      let webFileUrl = result.fileUrl;
      if (result.fileUrl && result.fileUrl.includes('/download/')) {
        const fname = result.fileUrl.split('/download/')[1];
        webFileUrl = `/api/pdf/serve/${fname}`;
      }

      // Log if Playwright was unavailable (HTML fallback generated)
      if (result.fileUrl && result.fileUrl.endsWith('.html')) {
        console.warn('[HF-Document] Playwright was unavailable, generated HTML fallback instead of PDF');
      }

      // Auto-upload to Google Drive in background (non-blocking)
      if (result.fileUrl && result.fileUrl.includes('/download/')) {
        uploadFileToDrive(result.fileUrl, `DeltaAI_${result.fileName}`, result.mimeType)
          .then((r) => {
            if (r.success) console.log(`[Doc] Auto-uploaded to Drive: ${r.fileId}`);
            else console.warn(`[Doc] Drive upload failed:`, r.error);
          })
          .catch(() => {});
      }

      return NextResponse.json({
        success: true,
        mode: 'local',
        fileUrl: webFileUrl,
        filePath: result.fileUrl,
        fileName: result.fileName,
        mimeType: result.mimeType,
        docType: result.docType,
        model: result.model,
        durationMs: result.durationMs,
      });
    }

    // ── Single mode (default — tries HF Gradio Space) ──────────────────
    if (!modelId || !topic) {
      return NextResponse.json(
        { error: 'معرف النموذج والموضوع مطلوبان' },
        { status: 400 }
      );
    }

    const model = getDocumentModelById(modelId);
    if (!model) {
      return NextResponse.json(
        { error: `نموذج غير معروف: ${modelId}` },
        { status: 400 }
      );
    }

    const result = await generateDocument(modelId, {
      topic,
      slideCount,
      language: language || 'ar',
      instructions,
      template,
      inputPdfUrl,
    });

    return NextResponse.json({
      success: true,
      mode: 'single',
      fileUrl: result.fileUrl,
      fileName: result.fileName,
      mimeType: result.mimeType,
      docType: result.docType,
      model: result.model,
      durationMs: result.durationMs,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[HF-Document] Generation error:', errorMsg);
    if (errorStack) console.error('[HF-Document] Stack:', errorStack);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء إنشاء المستند' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const models = getAllDocumentModelIds().map((id) => {
      const entry = getDocumentModelById(id);
      return { ...entry, id };
    });

    return NextResponse.json({
      models,
      total: models.length,
      types: ['pdf', 'pptx', 'xlsx', 'docx'],
      modes: ['single', 'batch'],
      batchMaxLectures: 12,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء استرجاع النماذج' },
      { status: 500 }
    );
  }
}
