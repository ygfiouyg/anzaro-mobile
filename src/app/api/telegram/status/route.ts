import { NextResponse } from 'next/server';
import { getTelegramStatus } from '@/lib/integrations/telegram-bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getTelegramStatus());
}
