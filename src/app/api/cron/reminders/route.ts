/**
 * GET /api/cron/reminders
 * 
 * Cron job — يشتغل كل دقيقة (يُنادى عليه من external cron أو HF scheduler)
 * 
 * 1. يبحث عن reminders where remindAt <= now AND status = 'PENDING'
 * 2. يبعت إيميل لكل واحد
 * 3. يحدّث status لـ 'SENT'
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // بدون auth — cron-job.org بينادي عليه مباشرة
  try {
    const now = new Date();

    // 1. ابحث عن PENDING reminders اللي وقتها جاء
    const pendingReminders = await db.reminder.findMany({
      where: {
        status: 'PENDING',
        remindAt: { lte: now },
      },
      take: 50, // حد أقصى 50 per run
    });

    if (pendingReminders.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'لا توجد تذكيرات' });
    }

    let sentCount = 0;
    let failedCount = 0;

    // 2. ابعت إيميل لكل reminder
    for (const reminder of pendingReminders) {
      try {
        await sendReminderEmail(reminder.userEmail, reminder.taskText);

        // 3. حدّث status لـ SENT
        await db.reminder.update({
          where: { id: reminder.id },
          data: { status: 'SENT' },
        });

        sentCount++;
      } catch (emailError: any) {
        console.error(`[Reminders] Failed to send to ${reminder.userEmail}:`, emailError.message);
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: pendingReminders.length,
    });
  } catch (error: any) {
    console.error('[Reminders] Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * إرسال إيميل تذكير — يستخدم Resend أو BREVO أو SMTP
 */
async function sendReminderEmail(toEmail: string, taskText: string): Promise<void> {
  const subject = '⏰ تذكير من DeltaAI';
  const html = `
    <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #10b981, #8b5cf6); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⏰ تذكير من DeltaAI</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 16px 16px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #374151; line-height: 1.8;">
          مرحباً،
        </p>
        <p style="font-size: 18px; color: #1f2937; line-height: 1.8; font-weight: 600;">
          ${taskText}
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">
          هذا التذكير أُرسل من منصة DeltaAI — بعقل هادي، هنوصل 🌊
        </p>
      </div>
    </div>
  `;

  // محاولة 1: Resend
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL || 'noreply@deltaai.com';

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom,
        to: toEmail,
        subject,
        html,
      }),
    });

    if (res.ok) {
      console.log(`[Reminders] Email sent via Resend to ${toEmail}`);
      return;
    }
    console.warn('[Reminders] Resend failed, trying BREVO...');
  }

  // محاولة 2: BREVO
  const brevoKey = process.env.BREVO_API_KEY;
  const brevoFrom = process.env.BREVO_SENDER_EMAIL || 'noreply@deltaai.com';
  const brevoName = process.env.BREVO_SENDER_NAME || 'DeltaAI';

  if (brevoKey) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: brevoFrom, name: brevoName },
        to: [{ email: toEmail }],
        subject,
        htmlContent: html,
      }),
    });

    if (res.ok) {
      console.log(`[Reminders] Email sent via BREVO to ${toEmail}`);
      return;
    }
    console.warn('[Reminders] BREVO failed, trying SMTP...');
  }

  // محاولة 3: SMTP (Nodemailer)
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: toEmail,
        subject,
        html,
      });

      console.log(`[Reminders] Email sent via SMTP to ${toEmail}`);
      return;
    } catch (smtpError: any) {
      console.error('[Reminders] SMTP failed:', smtpError.message);
    }
  }

  // لو كل الطرق فشلت
  throw new Error('No email service configured (RESEND, BREVO, or SMTP)');
}
