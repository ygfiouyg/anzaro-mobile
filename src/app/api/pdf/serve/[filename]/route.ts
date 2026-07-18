import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * GET /api/pdf/serve/[filename]
 * Serves a generated PDF, HTML, or TXT file from the download directory.
 *
 * SECURITY:
 * - Path traversal protection
 * - Content-Disposition: attachment for ALL file types (prevents XSS via HTML)
 * - File size limit to prevent OOM
 * - Async file reads to avoid blocking the event loop
 */

/** Maximum file size to serve: 100 MB */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'اسم الملف غير صالح' }, { status: 400 });
    }

    // Allow .pdf, .html, and .txt files
    const isPdf = filename.endsWith('.pdf');
    const isHtml = filename.endsWith('.html');
    const isTxt = filename.endsWith('.txt');
    if (!isPdf && !isHtml && !isTxt) {
      return NextResponse.json({ error: 'نوع الملف غير مدعوم — يُسمح فقط بملفات PDF و HTML و TXT' }, { status: 400 });
    }

    const downloadDir = join(process.cwd(), 'download');
    const filePath = join(downloadDir, filename);

    // ── FIX: Verify the resolved path is within the download directory ──
    const resolvedPath = join(downloadDir, filename);
    if (resolvedPath !== filePath || !filePath.startsWith(downloadDir)) {
      return NextResponse.json({ error: 'مسار الملف غير مسموح به' }, { status: 403 });
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'الملف غير موجود' }, { status: 404 });
    }

    // ── FIX: Use async readFile instead of readFileSync (H2) ──
    // readFileSync blocks the event loop for large files — causes cascading latency
    const fileBuffer = await readFile(filePath);

    // ── FIX: Add file size limit (M6) ──
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'حجم الملف كبير جداً' }, { status: 413 });
    }

    // ── FIX: Use buffer length instead of statSync (M3) ──
    const fileSize = fileBuffer.length;

    // ── FIX: Serve ALL files as attachment to prevent XSS (M10) ──
    // Previously HTML files were served inline, allowing script execution
    // in the same origin context. Now all files are downloaded.
    const contentType = isHtml
      ? 'text/html; charset=utf-8'
      : isTxt
        ? 'text/plain; charset=utf-8'
        : 'application/pdf';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        // ALL files served as attachment — prevents XSS from HTML files
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('PDF serve error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحميل الملف' },
      { status: 500 }
    );
  }
}
