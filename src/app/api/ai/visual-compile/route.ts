/**
 * POST /api/ai/visual-compile
 *
 * Flexible User-Driven Multi-PDF Compilation API
 *
 * Takes multiple PDF files, extracts text and images, and compiles a
 * comprehensive document based on the USER'S SPECIFIC INSTRUCTIONS.
 *
 * The user controls what gets extracted — no hardcoded templates.
 * Whether they ask for "active ingredients and microscopic images" or
 * "key formulas and diagrams" or anything else, the system adapts.
 *
 * Pipeline:
 * 1. AI plans extraction strategy based on user's request
 * 2. Extract text + images from each PDF
 * 3. VLM filters/labels images based on user's criteria
 * 4. AI extracts text content per user's instructions
 * 5. Compile into dynamic HTML → Playwright → PDF
 *
 * Works across ALL models via chat interface.
 */

import { NextRequest } from 'next/server';
import { processVisualCompile, type VisualCompileProgressCallback } from '@/lib/visual-compile-service';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // ── Auth + rate limiting ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'يجب تسجيل الدخول لاستخدام هذه الخدمة' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const rateLimitResponse = checkRateLimit(
      request,
      { ...RATE_LIMIT_PRESETS.ai, maxRequests: 10 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { pdfs, userPrompt, language } = body as {
      pdfs: Array<{ dataUrl: string; title: string }>;
      userPrompt?: string;
      language?: string;
    };

    // Validate
    if (!pdfs || !Array.isArray(pdfs) || pdfs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'مطلوب ملف PDF واحد على الأقل' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (pdfs.length > 12) {
      return new Response(
        JSON.stringify({ error: 'الحد الأقصى 12 ملف PDF' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate each PDF data
    for (const pdf of pdfs) {
      if (!pdf.dataUrl) {
        return new Response(
          JSON.stringify({ error: `بيانات PDF مفقودة: ${pdf.title || 'غير معروف'}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const resolvedLanguage = language || 'ar';
    const resolvedPrompt = userPrompt || '';

    // SSE Stream Response
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const onProgress: VisualCompileProgressCallback = (progress) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
          } catch {}
        };

        try {
          const result = await processVisualCompile(
            { pdfs, userPrompt: resolvedPrompt, language: resolvedLanguage },
            onProgress
          );

          if (!streamClosed) {
            // ── FIX: Save PDF to disk and return URL instead of inline base64 (H4) ──
            // Previously: pdfBuffer.toString('base64') was sent inline in SSE.
            // For large multi-PDF compilations (10-50MB), this caused massive
            // memory spikes (4x copies: buffer + base64 + JSON + encoded).
            const { writeFile, mkdir } = await import('fs/promises');
            const path = await import('path');
            const { db } = await import('@/lib/db');

            const downloadDir = path.join(process.cwd(), 'download');
            await mkdir(downloadDir, { recursive: true });

            const fileId = `compile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
            const outputPath = path.join(downloadDir, fileId);
            await writeFile(outputPath, result.pdfBuffer);

            // Save to database
            const asset = await db.generativeAsset.create({
              data: {
                userId: user.id,
                type: 'pdf',
                title: resolvedPrompt ? resolvedPrompt.slice(0, 100) : 'Visual Compile',
                prompt: resolvedPrompt || 'visual-compile',
                filePath: outputPath,
                fileSize: result.pdfBuffer.length,
                metadata: JSON.stringify({
                  source: 'visual-compile',
                  totalImagesFound: result.totalImagesFound,
                  relevantImages: result.relevantImages,
                  pdfCount: pdfs.length,
                  mimeType: 'application/pdf',
                }),
                model: 'visual-compile',
              },
            });

            const fileUrl = `/api/pdf/serve/${fileId}`;

            // Build dynamic labeled images summary
            const labeledSummary = result.pdfs.flatMap((pdf) =>
              pdf.images
                .filter((img) => img.isRelevant)
                .map((img) => ({
                  sourceTitle: img.sourceTitle || pdf.title,
                  pageNumber: img.pageNumber,
                  imageIndex: img.imageIndex,
                  isRelevant: img.isRelevant,
                  label: img.label,
                  category: img.category,
                  description: img.description,
                  confidence: img.confidence,
                  hasImageData: !!img.dataUrl,
                }))
            );

            // Build dynamic text summaries from sections
            const textSummaries = result.pdfs.map((pdf) => ({
              title: pdf.title,
              sections: pdf.sections.map(s => ({
                title: s.title,
                emoji: s.emoji,
                itemCount: s.items.length,
                topItems: s.items.slice(0, 5),
              })),
              relevantImageCount: pdf.images.filter(i => i.isRelevant).length,
            }));

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  stage: 'completed',
                  detail: resolvedLanguage === 'ar'
                    ? `تم! ${result.relevantImages} صورة مهمة من أصل ${result.totalImagesFound} — ${Math.round(result.totalProcessingTimeMs / 1000)}s`
                    : `Done! ${result.relevantImages} relevant images out of ${result.totalImagesFound} — ${Math.round(result.totalProcessingTimeMs / 1000)}s`,
                  current: 1,
                  total: 1,
                  percentComplete: 100,
                  // Download URL instead of inline base64
                  fileUrl,
                  assetId: asset.id,
                  pdfSize: result.pdfBuffer.length,
                  totalImagesFound: result.totalImagesFound,
                  relevantImages: result.relevantImages,
                  totalProcessingTimeMs: result.totalProcessingTimeMs,
                  labeledImages: labeledSummary,
                  textSummaries,
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
                    detail: 'حدث خطأ أثناء معالجة الملفات. يرجى المحاولة مرة أخرى.',
                    current: 0,
                    total: 1,
                    percentComplete: 0,
                  })}\n\n`
                )
              );
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch {}
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
    console.error('[VisualCompileAPI] Error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ غير متوقع أثناء التجميع' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
