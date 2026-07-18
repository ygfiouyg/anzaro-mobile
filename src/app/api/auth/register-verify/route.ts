import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, generateToken, getSessionDurationDays } from '@/lib/auth';
import { verifyOTP } from '@/lib/email.service';

/**
 * POST /api/auth/register-verify
 *
 * Combined OTP verification + registration endpoint.
 * Flow:
 *   1. User fills registration form (name, email, password)
 *   2. Frontend sends OTP to the email via /api/auth/send-otp
 *   3. User enters the 6-digit code
 *   4. Frontend calls this endpoint with name, email, password, and code
 *   5. This endpoint verifies the OTP and creates the user if valid
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, code } = body;

    // ── Validate all fields ──────────────────────────────
    if (!name || !email || !password || !code) {
      return NextResponse.json(
        { message: 'جميع الحقول مطلوبة بما فيها كود التحقق' },
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
    if (password.length < 6) {
      return NextResponse.json(
        { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
        { status: 400 }
      );
    }

    // Validate OTP code format
    const normalizedCode = String(code).replace(/\s+/g, '');
    if (!normalizedCode || normalizedCode.length !== 6) {
      return NextResponse.json(
        { message: 'كود التحقق يجب أن يكون 6 أرقام' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Check if email already exists ────────────────────
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني مسجل بالفعل' },
        { status: 409 }
      );
    }

    // ── Verify OTP code ──────────────────────────────────
    const otpResult = await verifyOTP(normalizedEmail, normalizedCode);

    if (!otpResult.valid) {
      return NextResponse.json(
        { message: 'كود التحقق غير صحيح أو منتهي الصلاحية' },
        { status: 400 }
      );
    }

    // ── OTP is valid → Create the user ───────────────────
    // FIX: Must await bcrypt hash (async operation)
    const hashedPassword = await hashPassword(password);

    // FIX: Admin role via environment variable, NOT hardcoded email
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isAdmin = adminEmails.includes(normalizedEmail);

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        isVerified: true, // Email is verified because OTP was valid
        role: isAdmin ? 'admin' : 'user',
      },
    });

    // ── Create session token (duration configurable via SESSION_DURATION_DAYS env var) ──
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

    // ── Update lastSeen ──────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      valid: true,
      token,
      user: {
        ...userWithoutPassword,
        lastSeen: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error('Register-verify error:', error);
    // FIX: Don't leak internal error details to clients
    return NextResponse.json(
      { message: 'حدث خطأ أثناء التسجيل' },
      { status: 500 }
    );
  }
}
