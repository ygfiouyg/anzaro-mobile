import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingWhatsAppMessage, type WhatsAppWebhookPayload } from '@/lib/integrations/whatsapp-bot';
import { createHmac } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WhatsApp webhook verification (GET)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  // SECURITY FIX #13: Fail closed if verify token not set — no hardcoded default
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!VERIFY_TOKEN) {
    console.error('[WhatsApp] WHATSAPP_VERIFY_TOKEN not set — refusing webhook subscription');
    return NextResponse.json(
      { error: 'Webhook verify token not configured' },
      { status: 503 }
    );
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// WhatsApp webhook receiver (POST)
export async function POST(req: NextRequest) {
  try {
    // SECURITY FIX #4: Verify X-Hub-Signature-256 HMAC
    const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
    if (!APP_SECRET) {
      console.error('[WhatsApp] WHATSAPP_APP_SECRET not set — refusing webhook');
      return NextResponse.json(
        { error: 'Webhook signature verification not configured' },
        { status: 503 }
      );
    }

    const signature = req.headers.get('x-hub-signature-256') || '';
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing X-Hub-Signature-256 header' },
        { status: 401 }
      );
    }

    // Get raw body for HMAC verification
    const rawBody = await req.text();

    // Compute expected signature
    const expectedSignature = 'sha256=' + createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');

    // Timing-safe comparison
    if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) {
      console.warn('[WhatsApp] Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse payload after signature verification
    const payload: WhatsAppWebhookPayload = JSON.parse(rawBody);

    // Process async (don't block the webhook response)
    handleIncomingWhatsAppMessage(payload).catch((e) => {
      console.error('[WhatsApp] Webhook error:', e);
    });

    return NextResponse.json({ status: 'received' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Timing-safe string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
