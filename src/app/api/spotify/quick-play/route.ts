/**
 * GET /api/spotify/quick-play?q=اسم+الأغنية
 * 
 * يدور على الأغنية في Spotify ويفتحها في تطبيق Spotify على طول.
 * لا OAuth، لا PKCE، لا DB.
 * بيستخدم Client Credentials (CLIENT_ID + SECRET فقط).
 * 
 * Response: { url: "https://open.spotify.com/track/XXX" }
 * الـ frontend بيفتح الـ URL ده → Spotify app بتفتح تلقائياً.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SPOTIFY_CLIENT_ID = 'd6d96fc0b0344544ad8c4edf58d4ab85';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query');

    if (!query) {
      return NextResponse.json({ error: 'q مطلوب' }, { status: 400 });
    }

    // 1. Get client credentials token
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'token_failed' }, { status: 500 });
    }

    const { access_token } = await tokenRes.json();

    // 2. Search for track
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    if (!searchRes.ok) {
      return NextResponse.json({ error: 'search_failed' }, { status: 500 });
    }

    const searchData = await searchRes.json();
    const tracks = searchData.tracks?.items || [];

    if (tracks.length === 0) {
      return NextResponse.json({ error: 'not_found', message: `لم يتم العثور على: ${query}` }, { status: 404 });
    }

    const track = tracks[0];
    const trackId = track.id;
    const url = `https://open.spotify.com/track/${trackId}`;

    return NextResponse.json({
      success: true,
      url,
      name: track.name,
      artist: track.artists?.map((a: any) => a.name).join(', '),
      image: track.album?.images?.[0]?.url,
      preview_url: track.preview_url, // 30 ثانية preview — بيشتغل في المتصفح
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
