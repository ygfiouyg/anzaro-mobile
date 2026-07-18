import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from "@/lib/with-auth";
import { startTelegramBot } from '@/lib/integrations/telegram-bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = await req.json();
    const { token } = body;

    const result = await startTelegramBot(token);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
});
