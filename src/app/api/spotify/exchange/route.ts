/**
 * POST /api/spotify/exchange
 * يـ exchange PKCE code لـ tokens (server-side — يتجنب CORS)
 * مش محمي بـ auth — PKCE code بيـ verify نفسه مع Spotify
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, code_verifier, redirect_uri } = body;

    if (!code || !code_verifier) {
      return NextResponse.json({ error: 'code + code_verifier required' }, { status: 400 });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID || '';

    // Exchange code for tokens (server-side — no CORS)
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        code_verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[Spotify] PKCE exchange failed:', tokenResponse.status, errText);
      return NextResponse.json({ error: 'exchange_failed', details: errText }, { status: 400 });
    }

    const tokens = await tokenResponse.json();
    
    // Return tokens to client — client will save via /api/spotify/save-tokens
    return NextResponse.json({ 
      success: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  } catch (error: any) {
    console.error('[Spotify] Exchange error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
