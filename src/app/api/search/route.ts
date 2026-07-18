import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { traceSearch, traceError, traceCache } from '@/lib/trace-logger';
import { recordApiResponseTime, recordError } from '@/lib/system-monitor';

// ─── Web Search API with Caching & Auth ───────────────────────────────
// Enhanced search route using z-ai-web-dev-sdk with in-memory cache

// ─── ZAI SDK Singleton ───────────────────────────────────────────────
declare global {
  var _zaiClientSearch: any;
}

async function getZAIClient() {
  if (!globalThis._zaiClientSearch) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    globalThis._zaiClientSearch = await ZAI.create();
  }
  return globalThis._zaiClientSearch;
}

interface SearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  date?: string;
}

interface CachedSearch {
  results: SearchResult[];
  timestamp: number;
  query: string;
}

// ─── In-Memory Cache ──────────────────────────────────────────────────
const searchCache = new Map<string, CachedSearch>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100; // Max cached queries

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      searchCache.delete(key);
    }
  }

  // If still too large, remove oldest entries
  if (searchCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(searchCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      searchCache.delete(key);
    }
  }
}

function getCacheKey(query: string, num: number, recencyDays?: number): string {
  return `${query.toLowerCase().trim()}|${num}|${recencyDays || 'all'}`;
}

// ─── GET Handler ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const requestStart = Date.now();

  try {
    // Auth check - require Bearer token
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { error: 'يرجى تسجيل الدخول للبحث' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { error: 'جلسة غير صالحة' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const q = request.nextUrl.searchParams.get('q');
    const numParam = request.nextUrl.searchParams.get('num');
    const recencyDaysParam = request.nextUrl.searchParams.get('recency_days');

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { error: 'يرجى إدخال كلمة البحث' },
        { status: 400 }
      );
    }

    const num = Math.min(Math.max(parseInt(numParam || '10', 10) || 10, 1), 20);
    const recencyDays = recencyDaysParam ? parseInt(recencyDaysParam, 10) : undefined;

    // Check cache first
    cleanExpiredCache();
    const cacheKey = getCacheKey(q, num, recencyDays);
    const cached = searchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      traceCache(`نتائج البحث من الذاكرة المؤقتة: ${q.slice(0, 30)}`);
      const duration = Date.now() - requestStart;
      recordApiResponseTime('/api/search', duration);

      return NextResponse.json({
        results: cached.results,
        query: q,
        num,
        cached: true,
        cacheAge: Math.round((Date.now() - cached.timestamp) / 1000) + 's',
      });
    }

    // Perform web search using ZAI SDK singleton
    traceSearch(`بحث ويب: ${q.slice(0, 50)}`);

    const zai = await getZAIClient();

    const searchParams: Record<string, unknown> = {
      query: q,
      num,
    };

    if (recencyDays && recencyDays > 0) {
      searchParams.recency_days = recencyDays;
    }

    const rawResults = await zai.functions.invoke('web_search', searchParams);

    // Parse and structure results
    let results: SearchResult[] = [];

    if (Array.isArray(rawResults)) {
      results = rawResults.map((item: Record<string, unknown>) => ({
        url: String(item.url || item.link || ''),
        name: String(item.name || item.title || ''),
        snippet: String(item.snippet || item.description || item.abstract || ''),
        host_name: String(item.host_name || (() => { try { return new URL(String(item.url || item.link || '')).hostname; } catch { return ''; } })()),
        date: item.date ? String(item.date) : undefined,
      }));
    } else if (rawResults && typeof rawResults === 'object') {
      // Handle nested results structure
      const resultsArray = (rawResults as Record<string, unknown>).results || (rawResults as Record<string, unknown>).data || [];
      if (Array.isArray(resultsArray)) {
        results = resultsArray.map((item: Record<string, unknown>) => ({
          url: String(item.url || item.link || ''),
          name: String(item.name || item.title || ''),
          snippet: String(item.snippet || item.description || item.abstract || ''),
          host_name: String(item.host_name || (() => { try { return new URL(String(item.url || item.link || '')).hostname; } catch { return ''; } })()),
          date: item.date ? String(item.date) : undefined,
        }));
      }
    }

    // Cache the results
    searchCache.set(cacheKey, {
      results,
      timestamp: Date.now(),
      query: q,
    });

    traceSearch(`تم العثور على ${results.length} نتائج للبحث: ${q.slice(0, 30)}`);

    const duration = Date.now() - requestStart;
    recordApiResponseTime('/api/search', duration);

    return NextResponse.json({
      results,
      query: q,
      num,
      cached: false,
      totalResults: results.length,
    });
  } catch (error) {
    const duration = Date.now() - requestStart;
    traceError(`خطأ في البحث: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    recordError('/api/search', error instanceof Error ? error.message : 'Unknown error');
    recordApiResponseTime('/api/search', duration);

    return NextResponse.json(
      { error: 'حدث خطأ أثناء البحث. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
