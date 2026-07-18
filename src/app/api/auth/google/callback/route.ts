/**
 * GET /api/auth/google/callback
 * Google OAuth callback — يستلم code، يحوله لـ tokens، يجيب user info
 * ينشئ/يحدّث user في Prisma، ينشئ session
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = `${process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space'}/api/auth/google/callback`;
const FRONTEND_URL = process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL || 'https://kopabdo-delta-ai-v2.hf.space';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const storedState = request.cookies.get('google_oauth_state')?.value;

  if (error) {
    return NextResponse.redirect(`${FRONTEND_URL}/?google_error=${error}`);
  }

  if (!code || !storedState || state !== storedState) {
    return NextResponse.redirect(`${FRONTEND_URL}/?google_error=invalid_state`);
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Google Auth] Token exchange failed:', tokenRes.status, errText);
      return NextResponse.redirect(`${FRONTEND_URL}/?google_error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json();

    // 2. Get user info (email + profile)
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${FRONTEND_URL}/?google_error=userinfo_failed`);
    }

    const googleUser = await userRes.json();
    const { email, name, picture } = googleUser;

    if (!email) {
      return NextResponse.redirect(`${FRONTEND_URL}/?google_error=no_email`);
    }

    // 3. Find or create user (upsert prevents race condition on concurrent Google logins)
    let user = await db.user.upsert({
      where: { email },
      create: {
        email,
        name: name || email.split('@')[0],
        avatar: picture || null,
        password: null, // Google users — no password
        isVerified: true, // Google email = verified
        role: 'user',
      },
      update: {
        // Update avatar if changed
        ...(picture ? { avatar: picture } : {}),
        lastSeen: new Date(),
      },
    });
    console.log('[Google Auth] User ready:', email);

    // 4. Create session
    const sessionToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.session.create({
      data: {
        token: sessionToken,
        userId: user.id,
        expiresAt,
      },
    });

    // 5. Redirect to frontend with token — V.14: set httpOnly cookie for reliable session persistence
    const response = NextResponse.redirect(
      `${FRONTEND_URL}/?google_login=${sessionToken}&google_name=${encodeURIComponent(user.name || '')}`
    );

    // Set session cookie (httpOnly, secure) — ensures the session persists across reloads
    response.cookies.set('anzaro_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Clear OAuth state cookie
    response.cookies.delete('google_oauth_state');

    return response;
  } catch (err: any) {
    console.error('[Google Auth] Callback error:', err);
    return NextResponse.redirect(`${FRONTEND_URL}/?google_error=callback_failed`);
  }
}
