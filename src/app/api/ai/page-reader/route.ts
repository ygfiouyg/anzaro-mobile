import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { traceAPI, traceError } from '@/lib/trace-logger';

// ─── ZAI SDK Singleton ───────────────────────────────────────────────
declare global {
  var _zaiClientPageReader: any;
}

async function getZAIClient() {
  if (!globalThis._zaiClientPageReader) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    globalThis._zaiClientPageReader = await ZAI.create();
  }
  return globalThis._zaiClientPageReader;
}

// ─── Page Reader API ─────────────────────────────────────────────────
// POST /api/ai/page-reader  { url: string }

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;
    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const body = await request.json();
    const { url } = body as { url: string };

    if (!url || url.trim().length === 0) {
      return NextResponse.json({ error: 'رابط الصفحة مطلوب' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'رابط غير صالح' }, { status: 400 });
    }

    traceAPI(`قراءة صفحة ويب: ${url.slice(0, 80)}`);

    const zai = await getZAIClient();

    const result = await zai.functions.invoke('page_reader', { url });

    // Parse the page reader result
    let title = '';
    let content = '';
    let html = '';
    let publishTime = '';

    if (typeof result === 'string') {
      content = result;
    } else if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      title = String(r.title || r.name || '');
      content = String(r.content || r.text || r.body || '');
      html = String(r.html || '');
      publishTime = String(r.publish_time || r.publishedTime || r.date || '');

      // If content is empty but we have HTML, use a simplified version
      if (!content && html) {
        content = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    // Limit content size
    if (content.length > 100000) {
      content = content.slice(0, 100000) + '\n\n[... تم اقتطاع المحتوى]';
    }

    traceAPI(`تم قراءة الصفحة بنجاح: ${title || url.slice(0, 50)} (${content.length} حرف)`);

    return NextResponse.json({
      url,
      title,
      content,
      html,
      publishTime,
      contentLength: content.length,
    });
  } catch (error) {
    console.error('[Page Reader] Error:', error);
    traceError(`خطأ في قراءة الصفحة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    globalThis._zaiClientPageReader = null;
    return NextResponse.json({ error: 'فشل في قراءة الصفحة' }, { status: 500 });
  }
}
