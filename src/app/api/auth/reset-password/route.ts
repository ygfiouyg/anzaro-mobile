import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, invalidateAllUserSessionsCache } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // ── Rate limiting: 5 reset attempts per minute per IP ──
  const rateLimitResponse = checkRateLimit(request, RATE_LIMIT_PRESETS.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, newPassword, otpCode } = body;

    // Validate fields
    if (!email || !newPassword) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني وكلمة المرور الجديدة مطلوبان' },
        { status: 400 }
      );
    }

    // ── FIX: Require OTP code for password reset ──
    // Previously, anyone who knew an email could reset the password
    // without verifying OTP. Now the OTP must be provided and validated.
    if (!otpCode) {
      return NextResponse.json(
        { message: 'كود التحقق (OTP) مطلوب لإعادة تعيين كلمة المرور' },
        { status: 400 }
      );
    }

    // Validate password length
    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'لم يتم العثور على حساب بهذا البريد الإلكتروني' },
        { status: 404 }
      );
    }

    // ── Verify OTP code before allowing password reset ──
    const otpRecord = await db.otpCode.findFirst({
      where: {
        email: normalizedEmail,
        code: otpCode,
        isUsed: false,
        type: 'reset',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { message: 'كود التحقق غير صالح أو منتهي الصلاحية' },
        { status: 400 }
      );
    }

    // Mark OTP as used
    await db.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Hash new password — MUST await bcrypt (async operation)
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    // Delete all existing sessions (force re-login)
    await db.session.deleteMany({
      where: { userId: user.id },
    });

    // ── FIX: Invalidate cached sessions so old token can't be reused ──
    invalidateAllUserSessionsCache(user.id);

    return NextResponse.json({
      success: true,
      message: 'تم إعادة تعيين كلمة المرور بنجاح',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' },
      { status: 500 }
    );
  }
}
