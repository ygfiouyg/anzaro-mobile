/**
 * OAuth Token Helper
 * Tools call getUserToken() to get the user's access_token for a provider.
 * This replaces static .env keys with per-user OAuth tokens.
 */

import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function getUserToken(sessionToken: string, provider: string): Promise<string | null> {
  try {
    const user = await verifyToken(sessionToken);
    if (!user) return null;

    const integration = await db.userIntegration.findFirst({
      where: { userId: user.id, provider, isActive: true },
    });

    if (!integration) return null;

    // Check expiry + auto-refresh
    if (integration.expiresAt && new Date(integration.expiresAt) < new Date()) {
      const refreshed = await refreshToken(integration.provider, integration.refreshToken);
      if (refreshed) {
        await db.userIntegration.update({
          where: { id: integration.id },
          data: { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt },
        });
        return refreshed.accessToken;
      }
      return null;
    }

    return integration.accessToken;
  } catch {
    return null;
  }
}

async function refreshToken(
  provider: string,
  refreshToken: string | null
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  if (!refreshToken) return null;

  const CONFIG: Record<string, { tokenUrl: string; clientIdEnv: string; clientSecretEnv: string }> = {
    google: { tokenUrl: 'https://oauth2.googleapis.com/token', clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET' },
    spotify: { tokenUrl: 'https://accounts.spotify.com/api/token', clientIdEnv: 'SPOTIFY_CLIENT_ID', clientSecretEnv: 'SPOTIFY_CLIENT_SECRET' },
  };

  const config = CONFIG[provider];
  if (!config) return null;

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) return null;

  try {
    const resp = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return { accessToken: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000) };
  } catch {
    return null;
  }
}
