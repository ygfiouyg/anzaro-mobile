/**
 * GET /api/islamic/times
 *
 * Fetches live prayer times from the free Aladhan API.
 * No API key required. Falls back to Cairo defaults on error.
 *
 * Query params:
 *   ?lat=30.0444&lng=31.2357  (defaults to Cairo if omitted)
 *   ?method=5                  (Egyptian General Authority — default 5)
 *
 * Architecture:
 * - Server-side fetch (no CORS issues for client)
 * - 1-hour in-memory cache (prayer times don't change within an hour)
 * - Graceful fallback to static Cairo times on API failure
 * - No auth required (public prayer times)
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ── In-memory cache (1 hour TTL) ──
interface CachedTimes {
  data: Record<string, unknown>;
  timestamp: number;
}
const cache = new Map<string, CachedTimes>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Fallback: static Cairo times ──
const CAIRO_FALLBACK = {
  Fajr: '04:30',
  Sunrise: '06:05',
  Dhuhr: '12:10',
  Asr: '15:35',
  Maghrib: '18:20',
  Isha: '19:50',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const lat = parseFloat(searchParams.get('lat') || '30.0444');
  const lng = parseFloat(searchParams.get('lng') || '31.2357');
  const method = parseInt(searchParams.get('method') || '5', 10);

  const cacheKey = `${lat},${lng},${method}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=${method}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      throw new Error(`Aladhan API returned ${res.status}`);
    }

    const json = await res.json();
    const timings = json?.data?.timings;

    if (!timings) {
      throw new Error('Invalid Aladhan response');
    }

    // Clean up times (remove timezone suffix like " (EET)")
    const cleanTimings: Record<string, string> = {};
    for (const [key, value] of Object.entries(timings)) {
      cleanTimings[key] = String(value).split(' ')[0];
    }

    const hijriDate = json?.data?.date?.hijri;
    const gregorianDate = json?.data?.date?.readable;

    const responseData = {
      success: true,
      timings: cleanTimings,
      hijriDate: hijriDate
        ? {
            day: hijriDate.day,
            month: hijriDate.month?.en,
            monthAr: hijriDate.month?.ar,
            year: hijriDate.year,
          }
        : null,
      gregorianDate,
      source: 'aladhan',
    };

    // Cache the result
    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[Islamic/Times] Error:', error);

    // Return fallback on error
    return NextResponse.json({
      success: true,
      timings: CAIRO_FALLBACK,
      hijriDate: null,
      gregorianDate: new Date().toDateString(),
      source: 'fallback-cairo',
      warning: 'Using fallback Cairo times — live API unavailable',
    });
  }
}
