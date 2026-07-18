import { NextRequest, NextResponse } from 'next/server';
import { verifyOTP } from '@/lib/email.service';
import { db } from '@/lib/db';
import { generateToken, getSessionDurationDays } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // ── Rate limiting: 5 verification attempts per minute per IP ──
  const rateLimitResponse = checkRateLimit(request, RATE_LIMIT_PRESETS.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, code } = body;

    // Validate fields
    if (!email || !code) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني وكود التحقق مطلوبان' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = String(code).replace(/\s+/g, ''); // Remove ALL spaces/whitespace from OTP code

    if (!normalizedCode) {
      return NextResponse.json(
        { message: 'كود التحقق مطلوب' },
        { status: 400 }
      );
    }

    // Verify OTP — checks in-memory store first, then falls back to database
    // This ensures OTPs remain verifiable even after server restarts
    const result = await verifyOTP(normalizedEmail, normalizedCode);

    if (!result.valid) {
      return NextResponse.json(
        { message: 'كود التحقق غير صحيح أو منتهي الصلاحية' },
        { status: 400 }
      );
    }

    // OTP is valid — find or create user (upsert prevents race condition)
    const nameFromEmail = normalizedEmail.split('@')[0];
    let user = await db.user.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        name: nameFromEmail,
        isVerified: true,
        role: 'user',
      },
      update: {
        isVerified: true,
      },
    });

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json(
        { message: 'هذا الحساب معطل. تواصل مع الدعم الفني' },
        { status: 403 }
      );
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

    // Update lastSeen
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
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء التحقق من الكود' },
      { status: 500 }
    );
  }
}
