import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/**
 * GET /api/health
 * HF Spaces health check — لازم يرد فوراً بدون أي imports تقيلة.
 * لو عملنا DB query أو imports تقيلة، أول request هيـ trigger compile
 * وهياخد وقت طويل → HF Spaces هتـ timeout.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'ok', timestamp: Date.now() });
}
