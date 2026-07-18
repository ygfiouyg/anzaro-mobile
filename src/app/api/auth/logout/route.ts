import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, invalidateSessionCache } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { message: 'رمز المصادقة مطلوب' },
        { status: 401 }
      );
    }

    // Find and delete the session
    const session = await db.session.findUnique({
      where: { token },
    });

    if (session) {
      await db.session.delete({
        where: { id: session.id },
      });
    }

    // ── FIX: Invalidate session cache so logged-out tokens can't be reused ──
    // Without this, a logged-out user's session could remain valid in the
    // in-memory cache for up to 60 seconds (the cache TTL).
    invalidateSessionCache(token);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء تسجيل الخروج' },
      { status: 500 }
    );
  }
}
