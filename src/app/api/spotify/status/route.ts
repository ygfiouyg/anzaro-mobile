/**
 * GET /api/spotify/status
 * يتحقق من حالة اتصال Spotify
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { db } from '@/lib/db';
import { NextRequest } from 'next/server';

export const GET = withAuth(async () => {
  try {
    const token = await db.spotifyToken.findFirst();
    
    if (!token) {
      return NextResponse.json({ connected: false });
    }

    // Check if token is expired
    const isExpired = token.expiresAt < new Date();
    
    if (isExpired) {
      // Try to refresh
      const refreshed = await refreshSpotifyToken(token.refreshToken);
      if (refreshed) {
        await db.spotifyToken.update({
          where: { id: token.id },
          data: {
            accessToken: refreshed.access_token,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          },
        });
        return NextResponse.json({ connected: true, refreshed: true });
      }
      return NextResponse.json({ connected: false, expired: true });
    }

    return NextResponse.json({ connected: true });
  } catch (error) {
    console.error('[Spotify] Status check failed:', error);
    return NextResponse.json({ connected: false, error: 'check_failed' });
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
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
