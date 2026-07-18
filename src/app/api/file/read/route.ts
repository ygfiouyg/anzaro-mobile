import { NextRequest, NextResponse } from 'next/server';
import { readFile, statSync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

const readFileAsync = promisify(readFile);

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.csv', '.json'];

// ═══════════════════════════════════════════════════════════════════════
// SECURITY FIX: Restrict file reads to the download directory only
// Previously allowed reading ANY file from the server filesystem
// ═══════════════════════════════════════════════════════════════════════
const ALLOWED_BASE_DIR = path.resolve(process.cwd(), 'download');

export async function POST(request: NextRequest) {
  try {
    // ── FIX: Require authentication for file reading ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user) {
      return NextResponse.json(
        { error: 'يجب تسجيل الدخول لقراءة الملفات' },
        { status: 401 }
      );
    }

    // ── Rate limiting: 30 file reads per minute per user ──
    const rateLimitResponse = checkRateLimit(
      request,
      { ...RATE_LIMIT_PRESETS.general, maxRequests: 30 },
      user.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { filePath } = body;

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'يرجى تحديد مسار الملف' }, { status: 400 });
    }

    // Security: prevent path traversal
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return NextResponse.json({ error: 'مسار الملف غير صالح' }, { status: 400 });
    }

    // Check file extension
    const ext = path.extname(normalizedPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `نوع الملف غير مدعوم. الأنواع المدعومة: ${SUPPORTED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // ── FIX: Restrict to download directory only ──
    // Previously allowed absolute paths to anywhere on the server
    const fullPath = path.resolve(ALLOWED_BASE_DIR, normalizedPath);

    // Verify the resolved path is within the allowed directory
    if (!fullPath.startsWith(ALLOWED_BASE_DIR + path.sep) && fullPath !== ALLOWED_BASE_DIR) {
      return NextResponse.json(
        { error: 'مسار الملف غير مسموح به — يُسمح فقط بقراءة ملفات من مجلد التنزيلات' },
        { status: 403 }
      );
    }

    const content = await readFileAsync(fullPath, 'utf-8');
    const stats = statSync(fullPath);

    // Limit file size to 1MB
    if (stats.size > 1024 * 1024) {
      return NextResponse.json(
        { error: 'الملف كبير جداً (الحد الأقصى 1 ميجابايت)' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      content,
      filePath: normalizedPath,
      extension: ext,
      size: stats.size,
      lastModified: stats.mtime.toISOString(),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'الملف غير موجود' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'حدث خطأ أثناء قراءة الملف' },
      { status: 500 }
    );
  }
}
