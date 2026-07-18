import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, isLegacyHash, generateToken, getSessionDurationDays } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // ── Rate limiting: 5 login attempts per minute per IP ──
  const rateLimitResponse = checkRateLimit(request, RATE_LIMIT_PRESETS.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate fields
    if (!email || !password) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
        { status: 400 }
      );
    }

    // ── FIX: Validate email format and trim whitespace ──
    const trimmedEmail = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        { message: 'صيغة البريد الإلكتروني غير صحيحة' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 }
      );
    }

    // Verify password using bcrypt (async) — supports legacy SHA256 migration
    if (!user.password) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 }
      );
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json(
        { message: 'هذا الحساب معطل. تواصل مع الدعم الفني' },
        { status: 403 }
      );
    }

    // ── Auto-upgrade legacy SHA256 hash to bcrypt on successful login ──
    if (isLegacyHash(user.password)) {
      try {
        const newBcryptHash = await hashPassword(password);
        await db.user.update({
          where: { id: user.id },
          data: { password: newBcryptHash },
        });
        console.log(`[Auth] Upgraded password hash for user ${user.email} from SHA256 to bcrypt`);
      } catch (upgradeErr) {
        console.warn('[Auth] Failed to upgrade password hash:', upgradeErr);
        // Non-blocking — user can still log in
      }
    }

    // Create session token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + getSessionDurationDays());

    await db.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Update user's lastSeen
    await db.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      user: {
        ...userWithoutPassword,
        lastSeen: new Date().toISOString(),
      },
      token,
    });
  } catch (error: unknown) {
    console.error('Login error:', error);
    // ── FIX: Remove debug info leak — don't expose internal errors to clients ──
    return NextResponse.json(
      { message: 'حدث خطأ أثناء تسجيل الدخول' },
      { status: 500 }
    );
  }
}
