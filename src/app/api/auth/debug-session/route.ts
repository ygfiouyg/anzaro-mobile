/**
 * GET /api/auth/debug-session
 * Endpoint لـ debug — بيقرا الـ NextAuth cookie ويعمل decode ويرجّع كل المعلومات.
 * مينفعش يتفضل في production (بيرجّع معلومات حساسة) بس ضروري عشان نلاقي المشكلة.
 *
 * NOTE: مبنستخدمش getServerSession() هنا عشان بتتعارض مع [...nextauth] catch-all route.
 */
import { NextRequest, NextResponse } from "next/server";
import { decode } from "next-auth/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** نفس logic بتاع getGoogleAuth + getStableSecret */
function getNextAuthSecret(): string | null {
  const envSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (envSecret) return envSecret;
  const googleId = process.env.GOOGLE_CLIENT_ID ?? "anzaro-google-id";
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET ?? "anzaro-google-secret";
  const url = process.env.NEXTAUTH_URL ?? "https://kopabdo-delta-ai-v2.hf.space";
  const source = `${url}:${googleId}:${googleSecret}:anzaro-v1`;
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash & hash;
  }
  return `anzaro-fallback-${Math.abs(hash).toString(16).padStart(16, "0")}-${source.length}`;
}

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const possibleNames = [
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ];

  let rawToken: string | null = null;
  let foundCookieName: string | null = null;
  for (const name of possibleNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = cookieHeader.match(new RegExp(`${escaped}=([^;]+)`));
    if (match) {
      rawToken = decodeURIComponent(match[1]);
      foundCookieName = name;
      break;
    }
  }

  const secret = getNextAuthSecret();
  const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";

  let decoded: any = null;
  let decodeError: string | null = null;
  if (rawToken && secret) {
    try {
      decoded = await decode({ token: rawToken, secret });
    } catch (e) {
      decodeError = e instanceof Error ? e.message : String(e);
    }
  }

  const safeDecoded = decoded ? {
    ...decoded,
    access_token: decoded.access_token ? `${String(decoded.access_token).slice(0, 20)}...(${String(decoded.access_token).length} chars)` : null,
    refresh_token: decoded.refresh_token ? "present" : null,
  } : null;

  return NextResponse.json({
    cookie_header_present: !!cookieHeader,
    cookie_header_preview: cookieHeader.slice(0, 300),
    found_session_cookie: !!rawToken,
    found_cookie_name: foundCookieName,
    nextauth_url: nextAuthUrl,
    nextauth_secret_present: !!secret,
    secure_cookie_expected: nextAuthUrl.startsWith("https://"),
    decoded_jwt: safeDecoded,
    decode_error: decodeError,
    has_access_token: !!decoded?.access_token,
    has_provider: !!decoded?.provider,
    provider: decoded?.provider ?? null,
    user_email: decoded?.email ?? null,
    user_name: decoded?.name ?? null,
  }, { status: 200 });
}
