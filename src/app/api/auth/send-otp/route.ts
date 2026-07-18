import { NextRequest, NextResponse } from 'next/server';
import { sendOTPEmail } from '@/lib/email.service';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // ── Rate limiting: 5 OTP requests per minute per IP ──
  const rateLimitResponse = checkRateLimit(request, RATE_LIMIT_PRESETS.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, type } = body;

    // Validate email
    if (!email) {
      return NextResponse.json(
        { message: 'البريد الإلكتروني مطلوب' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'صيغة البريد الإلكتروني غير صحيحة' },
        { status: 400 }
      );
    }

    // Send OTP email with type context (verification or reset)
    const language = 'ar'; // Default to Arabic
    const result = await sendOTPEmail(email, language, type);

    // ── Return OTP code when email delivery fails ──
    // When no email provider is configured, the user cannot receive the OTP via email.
    // In this case, we return the code in the response so the frontend can display it
    // as a fallback. This is essential for development/demo environments.
    // In production with email configured, emailDelivered will be true and fallbackCode
    // will not be set, so the code is never exposed.
    if (result.fallbackCode && !result.emailDelivered) {
      console.warn(`[OTP] Email delivery failed for ${email}. Returning fallback code to client.`);
    }

    return NextResponse.json({
      success: result.success,
      otpId: result.otpId,
      emailDelivered: result.emailDelivered,
      // Only include fallbackCode when email was NOT delivered
      // This allows the app to work without email configuration
      ...(result.fallbackCode && !result.emailDelivered ? { fallbackCode: result.fallbackCode } : {}),
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    const isRateLimit = error instanceof Error && error.message.includes('الحد الأقصى');
    const status = isRateLimit ? 429 : 500;
    return NextResponse.json(
      { message: 'حدث خطأ أثناء إرسال كود التحقق' },
      { status }
    );
  }
}
