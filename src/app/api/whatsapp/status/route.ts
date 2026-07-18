import { NextResponse } from 'next/server';
import { getWhatsAppStatus } from '@/lib/integrations/whatsapp-bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getWhatsAppStatus());
}
