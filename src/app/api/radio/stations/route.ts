import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { FALLBACK_RADIO_STATIONS } from '@/lib/radio-stations';

// Use shared fallback stations constant
const fallbackStations = FALLBACK_RADIO_STATIONS;

// ─── Auth Helper ─────────────────────────────────────────────────────

async function authenticateAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  const user = await getUserFromToken(token);
  if (!user || user.role !== 'admin') return null;

  return user;
}

// ─── GET: Return stations (active only for public, all for admin) ────

export async function GET(request: NextRequest) {
  try {
    // Check if admin is requesting all stations (including inactive)
    const adminUser = await authenticateAdmin(request);
    const includeAll = adminUser && request.nextUrl.searchParams.get('all') === 'true';

    // Try to get stations from database
    const dbStations = await db.radioStation.findMany({
      where: includeAll ? {} : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // If database has stations, use them; otherwise fallback
    const stations = dbStations.length > 0
      ? dbStations.map(s => ({
          id: s.id,
          name: s.name,
          streamUrl: s.streamUrl,
          logo: s.logo,
          category: s.category,
          isActive: s.isActive,
          sortOrder: s.sortOrder,
          createdAt: s.createdAt,
        }))
      : fallbackStations;

    return NextResponse.json({
      stations,
      total: stations.length,
    });
  } catch (error) {
    console.error('[RadioStations] Error fetching stations:', error);
    // Fallback to hardcoded stations on error
    return NextResponse.json({
      stations: fallbackStations,
      total: fallbackStations.length,
    });
  }
}

// ─── POST: Create a new station (admin only) ────────────────────────

export async function POST(request: NextRequest) {
  const user = await authenticateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, streamUrl, logo, category, sortOrder } = body;

    if (!name || !streamUrl) {
      return NextResponse.json(
        { error: 'اسم المحطة ورابط البث مطلوبان' },
        { status: 400 }
      );
    }

    // ── FIX: Validate streamUrl format and name length ──
    try {
      new URL(streamUrl);
    } catch {
      return NextResponse.json(
        { error: 'رابط البث غير صالح — يجب أن يكون URL صحيح' },
        { status: 400 }
      );
    }
    if (String(name).trim().length === 0 || String(name).length > 100) {
      return NextResponse.json(
        { error: 'اسم المحطة يجب أن يكون بين 1 و 100 حرف' },
        { status: 400 }
      );
    }

    const validCategories = ['islamic', 'quran', 'music', 'news'];
    const stationCategory = category && validCategories.includes(category) ? category : 'islamic';

    const station = await db.radioStation.create({
      data: {
        name,
        streamUrl,
        logo: logo || null,
        category: stationCategory,
        sortOrder: sortOrder ?? 0,
        isActive: true,
      },
    });

    return NextResponse.json({ station }, { status: 201 });
  } catch (error) {
    console.error('[RadioStations] Error creating station:', error);
    return NextResponse.json(
      { error: 'خطأ في إنشاء المحطة' },
      { status: 500 }
    );
  }
}
