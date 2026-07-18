/**
 * GET /api/oauth/callback?provider=google&code=xxx&state=xxx
 * Handles OAuth callback — exchanges code for tokens, saves to DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OAUTH_CONFIG: Record<string, {
  tokenUrl: string;
  userInfoUrl?: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  },
  notion: {
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_API_KEY',
  },
  spotify: {
    tokenUrl: 'https://accounts.spotify.com/api/token',
    userInfoUrl: 'https://api.spotify.com/v1/me',
    clientIdEnv: 'SPOTIFY_CLIENT_ID',
    clientSecretEnv: 'SPOTIFY_CLIENT_SECRET',
  },
};

const BASE_URL = process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const provider = searchParams.get('provider') || searchParams.get('state')?.split('&')[1]?.split('=')[1];
  const error = searchParams.get('error');

  const frontendUrl = BASE_URL;

  if (error) {
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=${error}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=missing_params`);
  }

  // Decode state to get user token
  let userToken: string;
  let oauthProvider: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    userToken = decoded.token;
    oauthProvider = decoded.provider || provider;
  } catch {
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=invalid_state`);
  }

  if (!oauthProvider || !OAUTH_CONFIG[oauthProvider]) {
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=invalid_provider`);
  }

  // Verify user token
  const user = await getUserFromToken(userToken);
  if (!user) {
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=invalid_session`);
  }

  const config = OAUTH_CONFIG[oauthProvider];
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  const redirectUri = `${BASE_URL}/api/oauth/callback?provider=${oauthProvider}`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=server_config`);
  }

  // Exchange code for tokens
  let tokenData: any;
  try {
    const tokenBody: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    };

    const tokenHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Notion uses Basic auth
    if (oauthProvider === 'notion') {
      tokenHeaders['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      delete tokenBody.client_id;
      delete tokenBody.client_secret;
    }

    const tokenResp = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: tokenHeaders,
      body: new URLSearchParams(tokenBody),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error(`[OAuth] Token exchange failed for ${oauthProvider}:`, errText);
      return NextResponse.redirect(`${frontendUrl}/?oauth_error=token_exchange`);
    }

    tokenData = await tokenResp.json();
  } catch (e: any) {
    console.error(`[OAuth] Token exchange error:`, e.message);
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=token_exception`);
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || null;
  const expiresIn = tokenData.expires_in || 3600;
  const scope = tokenData.scope || '';
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Get account ID (email for Google, ID for others)
  let accountId: string | null = null;
  if (config.userInfoUrl) {
    try {
      const userInfoResp = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoResp.ok) {
        const userInfo = await userInfoResp.json();
        accountId = userInfo.email || userInfo.id || null;
      }
    } catch {}
  }

  // Save to database (upsert — update if exists, create if not)
  try {
    await db.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider: oauthProvider,
        },
      },
      update: {
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        accountId,
        isActive: true,
      },
      create: {
        userId: user.id,
        provider: oauthProvider,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        accountId,
        isActive: true,
      },
    });

    console.log(`[OAuth] ✅ ${oauthProvider} connected for user ${user.id}`);
  } catch (e: any) {
    console.error(`[OAuth] DB save failed:`, e.message);
    return NextResponse.redirect(`${frontendUrl}/?oauth_error=db_save`);
  }

  // Redirect back to frontend with success
  return NextResponse.redirect(`${frontendUrl}/?oauth_success=${oauthProvider}`);
}
