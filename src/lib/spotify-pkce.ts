/**
 * Spotify PKCE OAuth Flow — client-side (بدون callback server-side)
 * 
 * الميزة: مفيش token exchange على السيرفر → مفيش invalid_grant
 * كل حاجة بتتم في الـ browser
 */

// Generate random string for PKCE
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.map((x) => possible[x % possible.length]).join('');
}

// Generate SHA-256 hash
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

// Base64 encode
function base64encode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || '';
const REDIRECT_URI = typeof window !== 'undefined' ? `${window.location.origin}` : '';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'app-remote-control',
  'playlist-read-private',
  'user-library-read',
].join(' ');

/**
 * Start PKCE OAuth flow — redirect to Spotify
 */
export async function startSpotifyPKCE(): Promise<void> {
  const clientId = SPOTIFY_CLIENT_ID || localStorage.getItem('spotify_client_id') || '';
  if (!clientId) {
    throw new Error('SPOTIFY_CLIENT_ID not configured');
  }

  // Store client_id for later use
  localStorage.setItem('spotify_client_id', clientId);

  // Generate PKCE verifier + challenge
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  // Store verifier for callback
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  // Build auth URL
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('scope', SCOPES);

  // Redirect to Spotify
  window.location.href = authUrl.toString();
}

/**
 * Handle PKCE callback — exchange code for tokens (client-side)
 * Returns true if successful, false if failed
 */
export async function handleSpotifyPKCECallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  
  if (!code) return false;

  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  const clientId = localStorage.getItem('spotify_client_id') || SPOTIFY_CLIENT_ID;

  if (!codeVerifier || !clientId) {
    console.error('[Spotify PKCE] Missing verifier or client_id');
    return false;
  }

  try {
    // Exchange code for tokens — client-side (no secret needed with PKCE)
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Spotify PKCE] Token exchange failed:', response.status, err);
      return false;
    }

    const tokens = await response.json();
    const { access_token, refresh_token, expires_in } = tokens;

    // Store tokens in DB via API
    const saveResponse = await fetch('/api/spotify/save-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token,
        refresh_token,
        expires_in,
      }),
    });

    if (!saveResponse.ok) {
      const errText = await saveResponse.text().catch(() => 'unknown');
      console.error('[Spotify PKCE] Failed to save tokens:', saveResponse.status, errText);
      // 401 = user not authenticated, 500 = DB issue (table missing/misconfigured)
      // Either way, the Spotify tokens are valid but we can't persist them.
      // Store in localStorage as fallback so the user can still use Spotify this session.
      try {
        localStorage.setItem('spotify_access_token', access_token);
        localStorage.setItem('spotify_refresh_token', refresh_token);
        localStorage.setItem('spotify_expires_at', String(Date.now() + expires_in * 1000));
        console.warn('[Spotify PKCE] Tokens saved to localStorage as fallback (DB save failed)');
      } catch {}
      return false;
    }

    // Clean up
    localStorage.removeItem('spotify_code_verifier');
    window.history.replaceState({}, document.title, window.location.pathname);

    return true;
  } catch (error) {
    console.error('[Spotify PKCE] Callback error:', error);
    return false;
  }
}
