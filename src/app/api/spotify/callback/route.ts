/**
 * GET /api/spotify/callback?code=xxx&state=xxx
 * OAuth callback — يستلم code من Spotify، يحوله لـ tokens، يحفظهم في DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const REDIRECT_URI = `${process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space'}/api/spotify/callback`;
const FRONTEND_URL = process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${FRONTEND_URL}/?spotify_error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${FRONTEND_URL}/?spotify_error=no_code`);
  }

  try {
    // Exchange code for tokens
    console.log('[Spotify] Exchanging code for tokens. Redirect URI:', REDIRECT_URI);
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[Spotify] Token exchange failed:', tokenResponse.status, errText);
      // Pass the actual error to frontend for debugging
      const errorCode = errText.includes('invalid_client') ? 'invalid_client' 
        : errText.includes('invalid_grant') ? 'invalid_grant'
        : errText.includes('redirect_uri_mismatch') ? 'redirect_uri_mismatch'
        : 'token_exchange_failed';
      return NextResponse.redirect(`${FRONTEND_URL}/?spotify_error=${errorCode}`);
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope } = tokens;

    // Get user ID from token (to associate tokens with the right user)
    // For now, we'll store tokens without user association
    // The frontend will handle associating with the logged-in user
    
    // Calculate expiry
    const expiresAt = new Date(Date.now() + (expires_in * 1000));

    // For simplicity, store as a global token (first user to auth gets it)
    // In production, you'd pass userId through the OAuth state
    const existing = await db.spotifyToken.findFirst();
    
    if (existing) {
      // Update existing
      await db.spotifyToken.update({
        where: { id: existing.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
          scope,
        },
      });
    } else {
      // Create new — need a user. Use first user in DB.
      const firstUser = await db.user.findFirst();
      if (!firstUser) {
        return NextResponse.redirect(`${FRONTEND_URL}/?spotify_error=no_user`);
      }
      await db.spotifyToken.create({
        data: {
          userId: firstUser.id,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
          scope,
        },
      });
    }

    // Redirect to frontend with success
    return NextResponse.redirect(`${FRONTEND_URL}/?spotify_connected=true`);
  } catch (error) {
    console.error('[Spotify] Callback error:', error);
    return NextResponse.redirect(`${FRONTEND_URL}/?spotify_error=callback_failed`);
  }
}
