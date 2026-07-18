/**
 * POST /api/ai/visual-extract
 *
 * PDF Visual Extractor API — Extracts, filters, labels, and compiles
 * educational images from a PDF lecture file into a Visual Summary PDF.
 *
 * Pipeline:
 * 1. Extract embedded images from PDF
 * 2. Filter irrelevant images (logos, decorations) using VLM
 * 3. Label each relevant image with Plant Name, Image Type, Diagnostic Feature
 * 4. Compile into a clean grid-based Visual Summary PDF
 *
 * Supports SSE progress streaming.
 *
 * SECURITY: Authentication is REQUIRED — prevents resource abuse
 * (Playwright instances + VLM API calls + disk storage)
 */

import { NextRequest } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { processPdfVisualExtract, type VisualExtractProgressCallback } from '@/lib/pdf-visual-extractor';

// ─── Increase body size limit for large PDF files (100MB) ───────────
export const maxDuration = 300; // 5 minutes timeout
export const dynamic = 'force-dynamic';

// ─── POST Handler ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: REQUIRE authentication (was "optional" — resource abuse vector) ──
    // Visual extract spins up Playwright (200-500MB RAM), makes VLM API calls,
    // and writes files to disk — MUST be authenticated
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'يجب تسجيل الدخول لاستخدام هذه الخدمة' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: 5 visual extracts per hour per user (expensive operation)
    const rateLimitResponse = checkRateLimit(
      request,
      { ...RATE_LIMIT_PRESETS.ai, maxRequests: 5 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { pdfData, pdfTitle, language } = body as {
      pdfData: string; // base64 data URL of the PDF
      pdfTitle?: string;
      language?: string;
    };

    // Validate required fields
    if (!pdfData) {
      return new Response(
        JSON.stringify({ error: 'بيانات PDF مطلوبة' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate PDF data format
    if (!pdfData.startsWith('data:application/pdf') && !pdfData.startsWith('data:')) {
      return new Response(
        JSON.stringify({ error: 'صيغة البيانات غير صالحة — يجب أن تكون PDF' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resolvedLanguage = language || 'ar';
    const resolvedTitle = pdfTitle || 'Visual Summary';

    // ── Stream Response with SSE Progress ──
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Progress callback — sends SSE events
        const onProgress: VisualExtractProgressCallback = (progress) => {
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
          // Run the visual extraction pipeline
          const result = await processPdfVisualExtract(
            pdfData,
            resolvedTitle,
            resolvedLanguage,
            onProgress
          );

          if (!streamClosed) {
            // ── FIX: Save PDF to disk and return download URL instead of base64 (H4) ──
            // Previously: the entire PDF buffer was converted to base64 and sent
            // inline in the SSE event. For large PDFs (10-50MB), this creates
            // 4x in-memory copies (buffer + base64 + JSON + encoded) = 40-260MB.
            // Now: save to disk, return a URL that the frontend can download.
            const { writeFile, mkdir } = await import('fs/promises');
            const path = await import('path');
            const downloadDir = path.join(process.cwd(), 'download');
            await mkdir(downloadDir, { recursive: true });

            const fileId = `visual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
            const outputPath = path.join(downloadDir, fileId);
            await writeFile(outputPath, result.pdfBuffer);

            // Save to database
            const { db } = await import('@/lib/db');
            const asset = await db.generativeAsset.create({
              data: {
                userId: user.id,
                type: 'pdf',
                title: resolvedTitle,
                prompt: 'visual-extract',
                filePath: outputPath,
                fileSize: result.pdfBuffer.length,
                metadata: JSON.stringify({
                  source: 'visual-extract',
                  totalImagesFound: result.totalImagesFound,
                  relevantImages: result.relevantImages,
                  model: result.model,
                  mimeType: 'application/pdf',
                }),
                model: result.model || 'visual-extract',
              },
            });

            const fileUrl = `/api/pdf/serve/${fileId}`;

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  stage: 'completed',
                  detail: `تم! ${result.relevantImages} صورة مهمة من أصل ${result.totalImagesFound} — ${Math.round(result.totalProcessingTimeMs / 1000)}s`,
                  current: 4,
                  total: 4,
                  percentComplete: 100,
                  // Summary data
                  totalImagesFound: result.totalImagesFound,
                  relevantImages: result.relevantImages,
                  totalProcessingTimeMs: result.totalProcessingTimeMs,
                  model: result.model,
                  // Download URL instead of inline base64
                  fileUrl,
                  assetId: asset.id,
                  pdfSize: result.pdfBuffer.length,
                  // Labeled images summary (without raw data for size)
                  labeledImages: result.labeledImages.map((img) => ({
                    pageNumber: img.pageNumber,
                    imageIndex: img.imageIndex,
                    isRelevant: img.isRelevant,
                    plantName: img.plantName,
                    imageType: img.imageType,
                    diagnosticFeature: img.diagnosticFeature,
                    confidence: img.confidence,
                    hasImageData: !!(img.dataUrl && img.mimeType !== 'text/vlm-analysis'),
                  })),
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
                    detail: 'حدث خطأ أثناء استخراج الصور',
                    current: 0,
                    total: 4,
                    percentComplete: 0,
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
    console.error('[VisualExtractAPI] Error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ غير متوقع أثناء استخراج الصور' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
