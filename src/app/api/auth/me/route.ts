import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken, rotateSessionToken, invalidateSessionCache } from '@/lib/auth';
import { db } from '@/lib/db';

// Session rotation: rotate token if it's older than 24 hours
const SESSION_ROTATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { message: 'رمز المصادقة مطلوب' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);

    if (!user) {
      return NextResponse.json(
        { message: 'جلسة غير صالحة أو منتهية الصلاحية' },
        { status: 401 }
      );
    }

    // ── Session Token Rotation ──
    // Check if the session is older than 24 hours and rotate if so.
    // This limits the window of opportunity if a token is compromised.
    let rotatedToken: string | null = null;
    try {
      const session = await db.session.findUnique({ where: { token } });
      if (session) {
        const sessionAge = Date.now() - new Date(session.createdAt).getTime();
        if (sessionAge > SESSION_ROTATION_MS) {
          rotatedToken = await rotateSessionToken(token, user.id);
        }
      }
    } catch (rotationErr) {
      // Non-blocking: if rotation fails, the old token is still valid
      console.warn('[Auth] Session rotation failed:', rotationErr instanceof Error ? rotationErr.message : String(rotationErr));
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      user: userWithoutPassword,
      // Include rotated token so client can update its stored token
      ...(rotatedToken ? { rotatedToken } : {}),
    });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء التحقق من المصادقة' },
      { status: 500 }
    );
  }
}
