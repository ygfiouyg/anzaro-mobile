/**
 * POST /api/spotify/save-tokens
 * يحفظ Spotify tokens في DB (من PKCE flow)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const body = await request.json();
    const { access_token, refresh_token, expires_in } = body;

    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: 'tokens required' }, { status: 400 });
    }

    const userId = ctx.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'user required' }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + (expires_in * 1000));

    // Check if user already has a token
    const existing = await db.spotifyToken.findUnique({
      where: { userId },
    });

    if (existing) {
      await db.spotifyToken.update({
        where: { userId },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
        },
      });
    } else {
      await db.spotifyToken.create({
        data: {
          userId,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Spotify] Save tokens error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
