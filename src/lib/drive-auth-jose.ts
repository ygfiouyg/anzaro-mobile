/**
 * Google Drive Auth using jose (Web Crypto API)
 * Bypasses Node.js OpenSSL 3.x which rejects valid PEM keys
 * with "DECODER routines::unsupported"
 */

import { importPKCS8, SignJWT } from 'jose';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
];

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a Google OAuth2 access token using jose (Web Crypto API).
 * This bypasses OpenSSL entirely.
 */
export async function getDriveAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  let key = serviceAccount.private_key;
  
  // Clean the key
  key = key.replace(/\\n/g, '\n').replace(/\r/g, '');
  if (!key.endsWith('\n')) key += '\n';

  // Import using jose's importPKCS8 (uses Web Crypto, not OpenSSL)
  const privateKey = await importPKCS8(key, 'RS256');

  // Create signed JWT
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${err}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return data.access_token;
}

/**
 * List files from Google Drive using the jose-based token.
 */
export async function listDriveFiles(
  serviceAccount: ServiceAccount,
  folderId: string,
  maxResults: number = 100
): Promise<any[]> {
  const accessToken = await getDriveAccessToken(serviceAccount);
  
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
  url.searchParams.set('pageSize', String(maxResults));
  url.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink)');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Drive API failed: ${response.status}`);
  }

  const data = await response.json() as { files: any[] };
  return data.files || [];
}
