/**
 * GET /api/auth/google
 * يبدأ Google OAuth flow (email + profile scopes فقط — بدون verification)
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = `${process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space'}/api/auth/google/callback`;

export async function GET() {
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 });
  }

  // Generate state for security
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    // V.45: Added Drive scopes so user can upload to their own Google Drive
    scope: 'email profile https://www.googleapis.com/auth/drive.file',
    state,
    prompt: 'select_account',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // Store state in cookie
  const response = NextResponse.redirect(authUrl);
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
