/**
 * GET /api/oauth/connect?provider=google
 * Starts the OAuth 2.0 flow for the specified provider.
 * Supports: google (Drive/Sheets/Calendar), notion, spotify
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OAUTH_CONFIG: Record<string, {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectPath: string;
}> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    redirectPath: '/api/oauth/callback',
  },
  notion: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scope: '',
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_API_KEY',
    redirectPath: '/api/oauth/callback',
  },
  spotify: {
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scope: 'user-read-private user-read-email streaming',
    clientIdEnv: 'SPOTIFY_CLIENT_ID',
    clientSecretEnv: 'SPOTIFY_CLIENT_SECRET',
    redirectPath: '/api/oauth/callback',
  },
};

const BASE_URL = process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!provider || !OAUTH_CONFIG[provider]) {
    return NextResponse.json({ error: 'Invalid provider. Use: google, notion, spotify' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const config = OAUTH_CONFIG[provider];
  const clientId = process.env[config.clientIdEnv];

  if (!clientId) {
    return NextResponse.json({ 
      error: `${config.clientIdEnv} not configured. Set it as a HuggingFace Space Secret.`,
    }, { status: 500 });
  }

  // Generate state for security (encode userId + random)
  const state = Buffer.from(JSON.stringify({ token, provider, ts: Date.now() })).toString('base64url');
  const redirectUri = `${BASE_URL}${config.redirectPath}?provider=${provider}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    prompt: 'consent',
    access_type: 'offline', // For Google refresh tokens
  });

  if (config.scope) {
    params.set('scope', config.scope);
  }

  const authUrl = `${config.authUrl}?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
