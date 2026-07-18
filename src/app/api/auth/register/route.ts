import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, generateToken, getSessionDurationDays } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // ── Rate limiting: 5 registration attempts per minute per IP ──
  const rateLimitResponse = checkRateLimit(request, RATE_LIMIT_PRESETS.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { name, email, password } = body;

    // Validate all fields are present
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبون' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'صيغة البريد الإلكتروني غير صحيحة' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني مسجل بالفعل' },
        { status: 409 }
      );
    }

    // ── FIX: Hash password using bcrypt (async) instead of SHA256 ──
    const hashedPassword = await hashPassword(password);

    // ── FIX: Admin role via environment variable, NOT hardcoded email ──
    // Previously: anyone could register as admin by knowing the email
    // Now: admin emails are specified in ADMIN_EMAILS env var (comma-separated)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isAdmin = adminEmails.includes(email.toLowerCase());

    // Create user
    const user = await db.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        isVerified: true,
        role: isAdmin ? 'admin' : 'user',
      },
    });

    // Create session token (duration configurable via SESSION_DURATION_DAYS env var)
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

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      user: userWithoutPassword,
      token,
    });
  } catch (error: unknown) {
    console.error('Register error:', error);
    // ── FIX: Remove debug info leak — don't expose internal errors to clients ──
    return NextResponse.json(
      { message: 'حدث خطأ أثناء التسجيل' },
      { status: 500 }
    );
  }
}
