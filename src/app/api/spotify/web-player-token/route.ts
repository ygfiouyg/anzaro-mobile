/**
 * GET /api/spotify/web-player-token
 * يرجع access token للـ Web Playback SDK
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { db } from '@/lib/db';
import { NextRequest } from 'next/server';

export const GET = withAuth(async () => {
  try {
    const tokenRecord = await db.spotifyToken.findFirst();
    if (!tokenRecord) {
      return NextResponse.json({ error: 'not_connected', message: 'Spotify غير مربوط' }, { status: 401 });
    }

    let accessToken = tokenRecord.accessToken;

    if (tokenRecord.expiresAt < new Date()) {
      const refreshed = await refreshSpotifyToken(tokenRecord.refreshToken);
      if (!refreshed) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }
      accessToken = refreshed.access_token;
      await db.spotifyToken.update({
        where: { id: tokenRecord.id },
        data: {
          accessToken: refreshed.access_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        },
      });
    }

    return NextResponse.json({ access_token: accessToken });
  } catch (error: any) {
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
});

async function refreshSpotifyToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
  const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
