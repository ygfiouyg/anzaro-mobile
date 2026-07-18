/**
 * GET /api/oauth/status
 * Returns all OAuth connections for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const integrations = await db.userIntegration.findMany({
    where: { userId: user.id, isActive: true },
    select: {
      provider: true,
      accountId: true,
      scope: true,
      expiresAt: true,
      updatedAt: true,
    },
  });

  // Build status map
  const SUPPORTED = ['google', 'notion', 'spotify'];
  const connected = new Set(integrations.map(i => i.provider));

  const status = SUPPORTED.map(provider => {
    const integration = integrations.find(i => i.provider === provider);
    return {
      provider,
      connected: connected.has(provider),
      accountId: integration?.accountId || null,
      expiresAt: integration?.expiresAt || null,
      needsReconnect: integration?.expiresAt 
        ? new Date(integration.expiresAt) < new Date() 
        : false,
    };
  });

  return NextResponse.json({ integrations: status });
}
