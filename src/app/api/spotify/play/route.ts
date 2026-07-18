/**
 * POST /api/spotify/play
 * يشغل أغنية على Spotify (محتاج Premium)
 * 
 * Body: { trackUri?: string, query?: string }
 * - trackUri: Spotify track URI (مثل spotify:track:xxx)
 * - query: اسم الأغنية (لو مش موجود trackUri، ندور عليه الأول)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { db } from '@/lib/db';

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { trackUri, query } = body;

    // Get stored token
    const tokenRecord = await db.spotifyToken.findFirst();
    if (!tokenRecord) {
      return NextResponse.json({ 
        error: 'not_connected',
        message: 'Spotify غير مربوط. اضغط على "ربط Spotify" الأول.' 
      }, { status: 401 });
    }

    let accessToken = tokenRecord.accessToken;

    // Check if expired, refresh if needed
    if (tokenRecord.expiresAt < new Date()) {
      const refreshed = await refreshSpotifyToken(tokenRecord.refreshToken);
      if (!refreshed) {
        return NextResponse.json({ 
          error: 'token_expired',
          message: 'انتهت صلاحية الـ token. اربط Spotify تاني.' 
        }, { status: 401 });
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

    let uri = trackUri;

    // If no trackUri, search for the song
    if (!uri && query) {
      const searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!searchResponse.ok) {
        return NextResponse.json({ 
          error: 'search_failed',
          message: `فشل البحث: ${searchResponse.status}` 
        }, { status: 500 });
      }

      const searchData = await searchResponse.json();
      const tracks = searchData.tracks?.items || [];
      
      if (tracks.length === 0) {
        return NextResponse.json({ 
          error: 'not_found',
          message: `لم يتم العثور على أغنية: ${query}` 
        }, { status: 404 });
      }

      uri = tracks[0].uri;
    }

    if (!uri) {
      return NextResponse.json({ 
        error: 'no_track',
        message: 'حدد اسم الأغنية أو trackUri' 
      }, { status: 400 });
    }

    // Play the track
    const playResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uris: [uri],
      }),
    });

    if (playResponse.status === 204) {
      return NextResponse.json({ 
        success: true,
        message: '🎵 جاري التشغيل على Spotify!',
        trackUri: uri,
      });
    }

    if (playResponse.status === 403) {
      return NextResponse.json({ 
        error: 'premium_required',
        message: 'التشغيل محتاج حساب Spotify Premium.' 
      }, { status: 403 });
    }

    if (playResponse.status === 404) {
      return NextResponse.json({ 
        error: 'no_device',
        message: 'مفيش جهاز Spotify نشط. افتح Spotify على أي جهاز الأول.' 
      }, { status: 404 });
    }

    const errorText = await playResponse.text();
    return NextResponse.json({ 
      error: 'play_failed',
      message: `فشل التشغيل: ${playResponse.status} - ${errorText.slice(0, 100)}` 
    }, { status: 500 });

  } catch (error: any) {
    console.error('[Spotify] Play error:', error);
    return NextResponse.json({ 
      error: 'server_error',
      message: error.message || 'خطأ في الخادم' 
    }, { status: 500 });
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
