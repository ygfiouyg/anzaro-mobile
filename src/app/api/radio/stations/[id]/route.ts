import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { FALLBACK_RADIO_STATIONS } from '@/lib/radio-stations';

// Build lookup from shared constant
const fallbackStations: Record<string, typeof FALLBACK_RADIO_STATIONS[number]> = {};
for (const s of FALLBACK_RADIO_STATIONS) {
  fallbackStations[s.id] = s;
}

// ─── Auth Helper ─────────────────────────────────────────────────────

async function authenticateAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  const user = await getUserFromToken(token);
  if (!user || user.role !== 'admin') return null;

  return user;
}

// ─── GET: Return a single station ───────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try database first
    try {
      const station = await db.radioStation.findUnique({
        where: { id },
      });

      if (station) {
        return NextResponse.json({ station });
      }
    } catch (dbError) {
      console.error('[RadioStation] DB error:', dbError);
    }

    // Fallback to hardcoded
    const fallbackStation = fallbackStations[id];
    if (fallbackStation) {
      return NextResponse.json({ station: fallbackStation });
    }

    return NextResponse.json(
      { error: 'المحطة غير موجودة' },
      { status: 404 }
    );
  } catch (error) {
    console.error('[RadioStation] Error:', error);
    return NextResponse.json(
      { error: 'خطأ داخلي في الخادم' },
      { status: 500 }
    );
  }
}

// ─── PUT: Update a station (admin only) ──────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, streamUrl, logo, category, isActive, sortOrder } = body;

    // ── FIX: Validate streamUrl format if provided ──
    if (streamUrl !== undefined) {
      try {
        new URL(streamUrl);
      } catch {
        return NextResponse.json(
          { error: 'رابط البث غير صالح — يجب أن يكون URL صحيح' },
          { status: 400 }
        );
      }
    }
    if (name !== undefined && (String(name).trim().length === 0 || String(name).length > 100)) {
      return NextResponse.json(
        { error: 'اسم المحطة يجب أن يكون بين 1 و 100 حرف' },
        { status: 400 }
      );
    }

    // Check if station exists
    const existing = await db.radioStation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'المحطة غير موجودة' },
        { status: 404 }
      );
    }

    const validCategories = ['islamic', 'quran', 'music', 'news'];
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (streamUrl !== undefined) updateData.streamUrl = streamUrl;
    if (logo !== undefined) updateData.logo = logo;
    if (category !== undefined) {
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: 'التصنيف غير صالح. القيم المسموحة: islamic, quran, music, news' },
          { status: 400 }
        );
      }
      updateData.category = category;
    }
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const station = await db.radioStation.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ station });
  } catch (error) {
    console.error('[RadioStation] Error updating station:', error);
    return NextResponse.json(
      { error: 'خطأ في تحديث المحطة' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete a station (admin only) ───────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Check if station exists
    const existing = await db.radioStation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'المحطة غير موجودة' },
        { status: 404 }
      );
    }

    await db.radioStation.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'تم حذف المحطة بنجاح' });
  } catch (error) {
    console.error('[RadioStation] Error deleting station:', error);
    return NextResponse.json(
      { error: 'خطأ في حذف المحطة' },
      { status: 500 }
    );
  }
}
