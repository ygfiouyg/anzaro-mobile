/**
 * GET /api/telegram/auto-setup
 * ============================
 * ينشط الـ Telegram bot webhook. بيـ set webhook URL على تليجرام.
 * Called by start.sh بعد ما Next.js يبقى ready.
 * 
 * PUBLIC endpoint — مش محتاج auth (عشان start.sh يقدر يناديه).
 * 
 * Returns immediately — setup runs in background.
 */
import { NextResponse } from 'next/server';
import { autoSetupTelegramWebhook } from '@/lib/integrations/telegram-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  // Run setup in background — don't block the response
  autoSetupTelegramWebhook().catch((e) => {
    console.error('[Telegram auto-setup] Error:', e.message);
  });

  return NextResponse.json({
    success: true,
    message: 'Telegram webhook setup started in background. Check /api/telegram/status after 10s.',
  });
}
