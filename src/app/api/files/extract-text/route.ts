import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { extractTextFromPdfBase64, extractTextFromDocxBase64 } from '@/lib/pdf-text-extractor';

// ─── Extract text from uploaded files (TXT, MD, PDF, DOCX) ───────────
// SECURITY: Authentication required, rate limited, strict file type validation
// FIX M2: Uses the proper multi-strategy PDF text extractor (unpdf → pdf2json → regex)
// instead of the broken raw-buffer regex approach that failed on most modern PDFs
// ENHANCEMENT: Added DOCX (Word) support via mammoth — users can now upload .docx files

// Allowed MIME types and extensions
const ALLOWED_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx']);

/** Maximum text length to return (50 KB — matches pdf-text-extractor default) */
const MAX_TEXT_LENGTH = 50 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user) {
      return NextResponse.json(
        { error: 'يجب تسجيل الدخول لرفع الملفات' },
        { status: 401 }
      );
    }

    // Rate limiting: 20 file uploads per minute per user
    const rateLimitResponse = checkRateLimit(
      request,
      { ...RATE_LIMIT_PRESETS.general, maxRequests: 20 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'لم يتم رفع ملف' }, { status: 400 });
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'حجم الملف أكبر من 5 ميجابايت' }, { status: 400 });
    }

    // Strict file type validation
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(fileExt)) {
      return NextResponse.json(
        { error: `نوع الملف غير مدعوم. الأنواع المدعومة: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
        { status: 400 }
      );
    }

    let text = '';

    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      // Plain text file — read directly
      text = await file.text();
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // ── FIX M2: Use proper multi-strategy PDF text extractor ──
      // Previous approach: raw buffer.toString('utf-8') + regex = broken for
      // compressed/encoded PDFs and Arabic text with CID fonts.
      // New approach: unpdf → pdf2json → regex fallback via shared utility.
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64DataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;

      text = await extractTextFromPdfBase64(base64DataUrl, MAX_TEXT_LENGTH);

      if (!text || text.length < 10) {
        return NextResponse.json({
          text: '',
          warning: 'لم يتم استخراج نص من PDF. جرب نسخ النص ولصقه مباشرة.',
        });
      }
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.toLowerCase().endsWith('.docx')
    ) {
      // ── ENHANCEMENT: DOCX (Word) support via mammoth ──
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64DataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${buffer.toString('base64')}`;

      text = await extractTextFromDocxBase64(base64DataUrl, MAX_TEXT_LENGTH);

      if (!text || text.length < 10) {
        return NextResponse.json({
          text: '',
          warning: 'لم يتم استخراج نص من ملف Word. جرب نسخ النص ولصقه مباشرة.',
        });
      }
    }

    // Apply text length limit (increased from 5000 to 50KB — FIX L8)
    const truncated = text.length > MAX_TEXT_LENGTH;
    const finalText = truncated ? text.slice(0, MAX_TEXT_LENGTH) + '...' : text;

    return NextResponse.json({
      text: finalText,
      truncated,
      totalLength: text.length,
      fileName: file.name,
    });
  } catch (error) {
    console.error('[FileExtract] Error:', error);
    return NextResponse.json(
      { error: 'فشل في استخراج النص من الملف' },
      { status: 500 }
    );
  }
}
