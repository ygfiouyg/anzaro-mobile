import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { traceImage, traceError } from '@/lib/trace-logger';

// ─── ZAI SDK Singleton ───────────────────────────────────────────────
declare global {
  var _zaiClientImageSearch: any;
}

async function getZAIClient() {
  if (!globalThis._zaiClientImageSearch) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    globalThis._zaiClientImageSearch = await ZAI.create();
  }
  return globalThis._zaiClientImageSearch;
}

// ─── Image Search API ────────────────────────────────────────────────
// GET /api/ai/image/search?q=...&num=6

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;
    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || '';
    const num = parseInt(searchParams.get('num') || '6', 10);

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'كلمة البحث مطلوبة' }, { status: 400 });
    }

    traceImage(`بحث عن صور: ${query.slice(0, 50)}`);

    const zai = await getZAIClient();

    const result = await zai.images.search.create({
      query,
      num: Math.min(num, 12),
    });

    // Parse results — the SDK may return different formats
    let images: Array<{
      url: string;
      thumbnail?: string;
      title?: string;
      description?: string;
      source?: string;
    }> = [];

    const mapItem = (item: Record<string, unknown>) => ({
      url: String(item.url || item.image_url || item.link || ''),
      thumbnail: String(item.thumbnail || item.thumbnail_url || ''),
      title: String(item.title || item.name || ''),
      description: String(item.snippet || item.description || ''),
      source: String(item.source || item.host_name || ''),
    });

    if (Array.isArray(result)) {
      images = result.slice(0, num).map(mapItem);
    } else if (result?.data) {
      images = (Array.isArray(result.data) ? result.data : []).slice(0, num).map(mapItem);
    } else if (result?.results) {
      images = (Array.isArray(result.results) ? result.results : []).slice(0, num).map(mapItem);
    }

    traceImage(`تم العثور على ${images.length} صور للبحث: ${query.slice(0, 30)}`);

    return NextResponse.json({ query, images, count: images.length });
  } catch (error) {
    console.error('[Image Search] Error:', error);
    traceError(`خطأ في بحث الصور: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    globalThis._zaiClientImageSearch = null;
    return NextResponse.json({ error: 'فشل في البحث عن الصور' }, { status: 500 });
  }
}
