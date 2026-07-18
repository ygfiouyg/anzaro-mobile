import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

// ─── Extract text from multiple uploaded files for batch processing ────
// Accepts multipart form data (no JSON body size limit issues)
// Returns extracted text for each file

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user) {
      return NextResponse.json(
        { error: 'يجب تسجيل الدخول لاستخراج النص' },
        { status: 401 }
      );
    }

    const rateLimitResponse = checkRateLimit(
      request,
      { ...RATE_LIMIT_PRESETS.general, maxRequests: 20 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const files: File[] = [];

    // Collect all files from form data
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'لم يتم رفع ملفات' }, { status: 400 });
    }

    if (files.length > 12) {
      return NextResponse.json({ error: 'الحد الأقصى 12 ملف' }, { status: 400 });
    }

    console.log(`[ExtractBatch] Processing ${files.length} files`);

    const results: Array<{
      name: string;
      content: string;
      type: string;
      size: number;
      chars: number;
    }> = [];

    for (const file of files) {
      const maxSize = 30 * 1024 * 1024; // 30MB per file
      if (file.size > maxSize) {
        results.push({
          name: file.name,
          content: `[الملف كبير جداً: ${Math.round(file.size / 1024 / 1024)}MB. تم تجاوزه.]`,
          type: file.type,
          size: file.size,
          chars: 0,
        });
        continue;
      }

      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          // PDF — extract text using server-side pdf-text-extractor
          const buffer = Buffer.from(await file.arrayBuffer());
          const base64 = buffer.toString('base64');
          const dataUri = `data:application/pdf;base64,${base64}`;

          try {
            const { extractTextFromPdfBase64 } = await import('@/lib/pdf-text-extractor');
            const extractedText = await extractTextFromPdfBase64(dataUri, 200 * 1024); // 200KB max text
            console.log(`[ExtractBatch] PDF "${file.name}": ${extractedText.length} chars extracted`);
            results.push({
              name: file.name,
              content: extractedText || `[لم يتم استخراج نص من ${file.name}]`,
              type: 'text/plain', // Change type to text since we extracted it
              size: file.size,
              chars: extractedText.length,
            });
          } catch (extractErr) {
            console.warn(`[ExtractBatch] PDF extraction failed for "${file.name}":`, extractErr);
            // FIX M2: Removed broken regex fallback — raw buffer regex on compressed
            // PDFs produces mojibake and is unreliable for Arabic text.
            // Instead, return a clear message that extraction failed.
            results.push({
              name: file.name,
              content: `[لم يتم استخراج نص من ${file.name}. جرب نسخ النص ولصقه مباشرة.]`,
              type: 'text/plain',
              size: file.size,
              chars: 0,
            });
          }
        } else if (
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.name.toLowerCase().endsWith('.docx')
        ) {
          // ── ENHANCEMENT: DOCX (Word) support via mammoth ──
          const buffer = Buffer.from(await file.arrayBuffer());
          const base64 = buffer.toString('base64');
          const dataUri = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;

          try {
            const { extractTextFromDocxBase64 } = await import('@/lib/pdf-text-extractor');
            const extractedText = await extractTextFromDocxBase64(dataUri, 200 * 1024); // 200KB max text
            console.log(`[ExtractBatch] DOCX "${file.name}": ${extractedText.length} chars extracted`);
            results.push({
              name: file.name,
              content: extractedText || `[لم يتم استخراج نص من ${file.name}]`,
              type: 'text/plain',
              size: file.size,
              chars: extractedText.length,
            });
          } catch (extractErr) {
            console.warn(`[ExtractBatch] DOCX extraction failed for "${file.name}":`, extractErr);
            results.push({
              name: file.name,
              content: `[لم يتم استخراج نص من ${file.name}. جرب نسخ النص ولصقه مباشرة.]`,
              type: 'text/plain',
              size: file.size,
              chars: 0,
            });
          }
        } else {
          // Non-PDF/DOCX — read as text
          const text = await file.text();
          results.push({
            name: file.name,
            content: text,
            type: file.type,
            size: file.size,
            chars: text.length,
          });
        }
      } catch (err) {
        console.warn(`[ExtractBatch] Error processing "${file.name}":`, err);
        results.push({
          name: file.name,
          content: `[خطأ في معالجة الملف: ${err instanceof Error ? err.message : String(err)}]`,
          type: file.type || 'application/octet-stream',
          size: file.size,
          chars: 0,
        });
      }
    }

    console.log(`[ExtractBatch] Completed: ${results.length} files processed`);

    return NextResponse.json({
      success: true,
      files: results,
      totalFiles: results.length,
      totalChars: results.reduce((sum, r) => sum + r.chars, 0),
    });
  } catch (error) {
    console.error('[ExtractBatch] Error:', error);
    return NextResponse.json(
      { error: 'فشل في استخراج النص من الملفات' },
      { status: 500 }
    );
  }
}
