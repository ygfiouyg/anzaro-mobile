/**
 * GET /api/spotify/auth
 * يبدأ OAuth flow مع Spotify
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { NextRequest } from 'next/server';

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const REDIRECT_URI = `${process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space'}/api/spotify/callback`;

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'app-remote-control',
  'playlist-read-private',
  'user-library-read',
].join(' ');

export const GET = withAuth(async (request: NextRequest) => {
  if (!SPOTIFY_CLIENT_ID) {
    return NextResponse.json({ error: 'SPOTIFY_CLIENT_ID not configured' }, { status: 500 });
  }

  const state = Math.random().toString(36).substring(7);
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', SCOPES);

  return NextResponse.json({ authUrl: authUrl.toString(), state });
});
