/**
 * POST /api/oauth/revoke
 * Revokes an OAuth connection for the authenticated user
 * Body: { provider: "google" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const body = await request.json() as { provider?: string };
  const provider = body.provider;

  if (!provider) {
    return NextResponse.json({ error: 'provider required' }, { status: 400 });
  }

  // Deactivate the integration (don't delete — keep for audit)
  await db.userIntegration.updateMany({
    where: { userId: user.id, provider },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true, provider, revoked: true });
}
