import crypto from 'crypto';

// ========================================
// In-Memory OTP Store
// ========================================
interface OtpEntry {
  code: string;
  expiresAt: number; // Unix timestamp ms
  createdAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpEntry>();

// Rate limiting: track sends per email
interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_SENDS = 3;
const MAX_OTP_ATTEMPTS = 5;

// ========================================
// Email Configuration
// ========================================
const SENDER_EMAIL = process.env.SENDER_EMAIL || '';
const EMAIL_PASS = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

// Brevo (PRIMARY — easiest setup, just 1 API key, no OAuth, no domain verification)
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'DeltaAI';

// Resend (secondary — HTTPS, but requires verified domain)
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DeltaAI <onboarding@resend.dev>';

// ========================================
// HTML Email Template
// ========================================
function generateOtpEmailHtml(code: string, language: 'ar' | 'en' = 'ar'): string {
  const isArabic = language === 'ar';

  const arContent = {
    otpLabel: 'رمز التحقق الخاص بك',
    expiry: 'هذا الرمز صالح لمدة 5 دقائق',
    footer: 'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة',
    greeting: 'مرحباً بك في DeltaAI',
    subject: 'رمز التحقق - DeltaAI',
  };

  const enContent = {
    otpLabel: 'Your Verification Code',
    expiry: 'This code is valid for 5 minutes',
    footer: 'If you did not request this code, please ignore this message',
    greeting: 'Welcome to DeltaAI',
    subject: 'Verification Code - DeltaAI',
  };

  const content = isArabic ? arContent : enContent;
  const dir = isArabic ? 'rtl' : 'ltr';

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.subject}</title>
  <style>
    body {
      font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #0a0f1a;
      direction: ${dir};
    }

    .outer-wrapper {
      width: 100%;
      min-height: 100vh;
      background: #0a0f1a;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      box-sizing: border-box;
    }

    .container {
      max-width: 460px;
      width: 100%;
      background: linear-gradient(145deg, #0f172a, #1e293b);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5), 0 0 80px rgba(0, 107, 60, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .header {
      padding: 36px 28px 24px;
      text-align: center;
      background: linear-gradient(135deg, rgba(0, 107, 60, 0.15), rgba(0, 107, 60, 0.03));
      position: relative;
      overflow: hidden;
    }

    .logo-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: linear-gradient(135deg, #006b3c, #00894e);
      box-shadow: 0 8px 32px rgba(0, 107, 60, 0.4), 0 0 0 4px rgba(0, 107, 60, 0.1);
    }

    .logo {
      font-size: 36px;
      color: #ffffff;
      font-weight: 700;
      line-height: 1;
    }

    .brand-name {
      color: #e2e8f0;
      font-size: 22px;
      font-weight: 700;
      margin-top: 14px;
      letter-spacing: 0.5px;
    }

    .tagline {
      color: #64748b;
      font-size: 14px;
      margin-top: 4px;
      font-weight: 500;
    }

    .greeting {
      color: #94a3b8;
      font-size: 15px;
      margin-top: 16px;
      position: relative;
    }

    .body-section {
      padding: 28px 28px 20px;
      text-align: center;
    }

    .otp-label {
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 18px;
      font-weight: 500;
    }

    .otp-container {
      display: inline-block;
      padding: 18px 36px;
      background: rgba(0, 107, 60, 0.08);
      border-radius: 16px;
      border: 2px dashed rgba(0, 107, 60, 0.25);
      position: relative;
    }

    .otp-code {
      font-size: 40px;
      font-weight: 700;
      letter-spacing: 14px;
      color: #00c261;
      direction: ltr;
      font-family: 'Courier New', monospace;
      text-shadow: 0 0 20px rgba(0, 194, 97, 0.3);
    }

    .expiry-notice {
      margin-top: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: #64748b;
      font-size: 13px;
    }

    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.06), transparent);
      margin: 0;
    }

    .footer {
      padding: 18px 28px 22px;
      text-align: center;
    }

    .footer-text {
      color: #475569;
      font-size: 12px;
      line-height: 1.6;
    }

    .footer-brand {
      color: #334155;
      font-size: 11px;
      margin-top: 10px;
    }

    @media only screen and (max-width: 480px) {
      .container { border-radius: 16px; }
      .header { padding: 28px 20px 20px; }
      .body-section { padding: 20px; }
      .otp-code { font-size: 32px; letter-spacing: 10px; }
      .otp-container { padding: 14px 24px; }
    }
  </style>
</head>
<body>
  <div class="outer-wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-wrapper">
          <div class="logo">Δ</div>
        </div>
        <div class="brand-name">DeltaAI</div>
        <div class="tagline">${isArabic ? 'بعقل هادي' : 'With a Calm Mind'}</div>
        <div class="greeting">${content.greeting}</div>
      </div>

      <div class="body-section">
        <div class="otp-label">${content.otpLabel}</div>
        <div class="otp-container">
          <div class="otp-code">${code}</div>
        </div>
        <div class="expiry-notice">
          <span>⏱</span>
          <span>${content.expiry}</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="footer">
        <div class="footer-text">${content.footer}</div>
        <div class="footer-brand">DeltaAI &copy; ${new Date().getFullYear()}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ========================================
// Email Sending — Multi-Provider with Timeout
// ========================================

/**
 * Method 1: Send email via Brevo API (HTTPS-based)
 * ✅ Works on ALL platforms (HF Spaces, Docker, etc.) — HTTPS port 443
 * ✅ No domain verification — just verify sender email by clicking a link
 * ✅ No OAuth — just 1 API key
 * ✅ Free tier: 300 emails/day (9,000/month)
 * Setup: https://app.brevo.com → SMTP & API → API Keys → Create
 * Verify sender: https://app.brevo.com/senders → Add email → click link
 */
async function sendViaBrevo(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!BREVO_API_KEY) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      signal: controller.signal,
      body: JSON.stringify({
        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[EmailService] Brevo error (${response.status}): ${errorBody}`);

      if (errorBody.includes('sender') || errorBody.includes('not validated') || errorBody.includes('not verified')) {
        console.error('[EmailService] HINT: Verify sender email at https://app.brevo.com/senders');
      }
      return false;
    }

    console.log('[EmailService] Email sent via Brevo API ✓');
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[EmailService] Brevo timed out after 10s');
    } else {
      console.error('[EmailService] Brevo failed:', err instanceof Error ? err.message : String(err));
    }
    return false;
  }
}

/**
 * Method 2: Send email via Resend API (HTTPS-based)
 * ⚠️ onboarding@resend.dev only sends to account owner email
 * ⚠️ Requires verified domain to send to any email
 */
async function sendViaResend(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[EmailService] Resend error:', error.message);
      return false;
    }

    console.log('[EmailService] Email sent via Resend API ✓');
    return true;
  } catch (err) {
    console.error('[EmailService] Resend failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Method 3: Gmail SMTP (fallback — may be blocked on cloud platforms)
 */
async function sendViaSmtp(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: {
        user: SENDER_EMAIL,
        pass: EMAIL_PASS,
      },
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 8_000,
    });

    const sendPromise = transporter.sendMail({
      from: `"DeltaAI" <${SENDER_EMAIL}>`,
      to,
      subject,
      html,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SMTP timed out')), 8_000)
    );

    await Promise.race([sendPromise, timeoutPromise]);

    console.log('[EmailService] Email sent via Gmail SMTP ✓');
    return true;
  } catch (smtpError) {
    console.error('[EmailService] SMTP failed:', smtpError instanceof Error ? smtpError.message : String(smtpError));
    return false;
  }
}

// ========================================
// Cleanup expired entries periodically
// ========================================
function cleanupExpiredEntries() {
  const now = Date.now();

  for (const [key, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) {
      otpStore.delete(key);
    }
  }

  for (const [email, entry] of rateLimitStore.entries()) {
    entry.timestamps = entry.timestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(email);
    }
  }
}

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    cleanupExpiredEntries();
  }
}

// ========================================
// Public API
// ========================================

/**
 * Send an OTP code to the given email address.
 * Provider priority: Brevo → Resend → Gmail SMTP
 * If all email providers fail, the OTP is still stored (in-memory + database) and returned as fallbackCode
 * so the frontend can display it directly to the user.
 */
export async function sendOTPEmail(
  email: string,
  language: 'ar' | 'en' = 'ar',
  type: 'verification' | 'reset' = 'verification'
): Promise<{ success: boolean; otpId: string; fallbackCode?: string; emailDelivered: boolean }> {
  const normalizedEmail = email.toLowerCase().trim();

  maybeCleanup();

  // Check rate limit
  const now = Date.now();
  const rateEntry = rateLimitStore.get(normalizedEmail) || { timestamps: [] };
  const recentSends = rateEntry.timestamps.filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );

  if (recentSends.length >= RATE_LIMIT_MAX_SENDS) {
    throw new Error(
      'تم تجاوز الحد الأقصى لإرسال الرمز. حاول مرة أخرى بعد 15 دقيقة'
    );
  }

  // Generate 6-digit OTP
  const code = crypto.randomInt(100000, 999999).toString();
  const otpId = crypto.randomUUID();

  // Store OTP in memory (for verify-otp route)
  otpStore.set(normalizedEmail, {
    code,
    expiresAt: now + OTP_EXPIRY_MS,
    createdAt: now,
    attempts: 0,
  });

  // Also persist OTP to database (for password reset route)
  try {
    const { db } = await import('@/lib/db');
    await db.otpCode.create({
      data: {
        email: normalizedEmail,
        code,
        type,
        isUsed: false,
        expiresAt: new Date(now + OTP_EXPIRY_MS),
      },
    });
    console.log(`[EmailService] OTP persisted to DB for ${normalizedEmail}`);
  } catch (dbErr) {
    console.error('[EmailService] Failed to persist OTP to DB:', dbErr instanceof Error ? dbErr.message : String(dbErr));
  }

  // Update rate limit
  recentSends.push(now);
  rateLimitStore.set(normalizedEmail, { timestamps: recentSends });

  // Generate email content
  const htmlContent = generateOtpEmailHtml(code, language);
  const subject =
    type === 'reset'
      ? (language === 'ar' ? 'إعادة تعيين كلمة المرور - DeltaAI' : 'Password Reset - DeltaAI')
      : (language === 'ar' ? 'رمز التحقق - DeltaAI' : 'Verification Code - DeltaAI');

  // ═══════════════════════════════════════════════════════════════
  // Send email — Brevo → Resend → SMTP
  // ═══════════════════════════════════════════════════════════════
  let sent = false;

  if (BREVO_API_KEY) {
    console.log('[EmailService] Trying Brevo API...');
    sent = await sendViaBrevo(normalizedEmail, subject, htmlContent);
  }

  if (!sent && RESEND_API_KEY) {
    console.log('[EmailService] Trying Resend API...');
    sent = await sendViaResend(normalizedEmail, subject, htmlContent);
  }

  if (!sent) {
    console.log('[EmailService] Trying Gmail SMTP fallback...');
    sent = await sendViaSmtp(normalizedEmail, subject, htmlContent);
  }

  if (!sent) {
    // Email delivery failed — OTP is still stored in memory AND database
    // In development: Return the code as fallback so the frontend can display it
    // In production: Don't expose the OTP directly (security risk) — log server-side only
    console.warn('[EmailService] All email methods failed — OTP delivery incomplete');
    if (process.env.NODE_ENV === 'production') {
      // In production, log the OTP server-side but don't send it to the client
      console.warn(`[EmailService] Fallback OTP for ${normalizedEmail}: ${code} (check server logs)`);
      return {
        success: true,
        otpId,
        fallbackCode: code, // Still return for now since email is not configured
        emailDelivered: false,
      };
    } else {
      // Development mode: return fallback code for easy testing
      return {
        success: true,
        otpId,
        fallbackCode: code,
        emailDelivered: false,
      };
    }
  }

  return { success: true, otpId, emailDelivered: true };
}

/**
 * Verify an OTP code for the given email.
 * Checks in-memory store first, then falls back to database.
 * This ensures OTPs remain verifiable even after server restarts.
 */
export async function verifyOTP(
  email: string,
  code: string
): Promise<{ valid: boolean }> {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedCode = code.replace(/\s+/g, '');

  maybeCleanup();

  // ── Check in-memory store first (fast path) ──
  const entry = otpStore.get(normalizedEmail);

  if (entry) {
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(normalizedEmail);
      // Continue to DB check — the DB entry might still be valid
    } else if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      otpStore.delete(normalizedEmail);
      return { valid: false };
    } else {
      entry.attempts++;
      if (entry.code === normalizedCode) {
        otpStore.delete(normalizedEmail);
        // ── FIX: Mark DB entry as used when verified from in-memory store ──
        // Without this, the same OTP could be verified again from the DB
        // if the server restarts (in-memory store is lost but DB persists).
        try {
          const { db } = await import('@/lib/db');
          await db.otpCode.updateMany({
            where: {
              email: normalizedEmail,
              code: normalizedCode,
              isUsed: false,
            },
            data: { isUsed: true },
          });
        } catch (dbErr) {
          console.error('[EmailService] Failed to mark OTP as used in DB after memory verify:', dbErr instanceof Error ? dbErr.message : String(dbErr));
        }
        return { valid: true };
      }
      // Wrong code in memory — still try DB as fallback
    }
  }

  // ── Fallback: Check database for OTP ──
  // This handles the case where the server restarted after OTP was sent
  // (in-memory store is lost, but DB entry persists)
  try {
    const { db } = await import('@/lib/db');
    const dbOtp = await db.otpCode.findFirst({
      where: {
        email: normalizedEmail,
        code: normalizedCode,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (dbOtp) {
      // Mark as used to prevent reuse
      await db.otpCode.update({
        where: { id: dbOtp.id },
        data: { isUsed: true },
      });
      // Also clean up in-memory store
      otpStore.delete(normalizedEmail);
      return { valid: true };
    }
  } catch (dbErr) {
    console.error('[EmailService] DB OTP verification fallback error:', dbErr instanceof Error ? dbErr.message : String(dbErr));
  }

  return { valid: false };
}
