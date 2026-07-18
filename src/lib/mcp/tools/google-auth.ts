/**
 * Shared Google Auth Helper for MCP Tools
 * بيقرا الـ NextAuth session cookie مباشرة ويعمل decode للـ JWT.
 */
import { getServerSession } from "next-auth";
import { decode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth-nextauth";
import type { Session } from "next-auth";
import { getRequestContext } from "@/lib/request-context";

/**
 * نفس الـ secret اللي auth-nextauth.ts بيستخدمه (getStableSecret).
 * لازم يكون نفسه عشان نـ decode الـ JWT بنفس الـ secret اللي اتعمل بيه.
 */
function getNextAuthSecret(): string | null {
  const envSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (envSecret) return envSecret;

  // نفس logic بتاع getStableSecret() في auth-nextauth.ts
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

export interface GoogleAuth {
  accessToken: string;
  user?: { email?: string | null; name?: string | null };
}

export const NOT_CONNECTED_ERROR = `🔒 حساب Google غير مربوط.

لازم تربط حساب Google الأول عشان الأداة دي تشتغل.
افتح Integration Dashboard (من قائمة "المزيد" ⟶ "ربط Google Workspace")
واضغط "ربط حساب Google".

بعد الربط، حاول تاني وهتشتغل تلقائياً.`;

/** اقرا الـ NextAuth session cookie مباشرة + decode JWT. */
async function readSessionFromCookie(): Promise<Session | null> {
  const req = getRequestContext();
  if (!req) return null;

  const cookieHeader = req.headers.get("cookie") ?? "";
  if (!cookieHeader) {
    console.warn("[google-auth] لا يوجد cookie header");
    return null;
  }

  const possibleNames = [
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ];

  let rawToken: string | null = null;
  for (const name of possibleNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = cookieHeader.match(new RegExp(`${escaped}=([^;]+)`));
    if (match) {
      rawToken = decodeURIComponent(match[1]);
      console.log(`[google-auth] لقيت cookie: ${name}`);
      break;
    }
  }

  if (!rawToken) {
    console.warn("[google-auth] مفيش next-auth session cookie. cookies:", cookieHeader.slice(0, 200));
    return null;
  }

  const secret = getNextAuthSecret();
  if (!secret) {
    console.error("[google-auth] NEXTAUTH_SECRET مش متاح وفشل توليد fallback");
    return null;
  }

  try {
    const decoded = await decode({ token: rawToken, secret });
    if (!decoded) {
      console.warn("[google-auth] decode رجع null");
      return null;
    }
    console.log("[google-auth] ✅ JWT decoded. keys:", Object.keys(decoded));
    if (!decoded.access_token) {
      console.warn("[google-auth] الـ JWT ملوش access_token");
      return null;
    }
    return {
      accessToken: decoded.access_token as string,
      user: {
        email: decoded.email as string | null,
        name: decoded.name as string | null,
      },
    } as unknown as Session;
  } catch (e) {
    console.warn("[google-auth] decode فشل:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function getGoogleAuth(): Promise<GoogleAuth | null> {
  // 1. اقرا الـ cookie مباشرة
  const session = await readSessionFromCookie();
  if (session?.accessToken) {
    return {
      accessToken: session.accessToken,
      user: session.user ? { email: session.user.email, name: session.user.name } : undefined,
    };
  }

  // 2. Fallback: getServerSession()
  try {
    const serverSession = await getServerSession(authOptions);
    if (serverSession?.accessToken) {
      console.log("[google-auth] ✅ access_token via getServerSession()");
      return {
        accessToken: serverSession.accessToken,
        user: serverSession.user ? { email: serverSession.user.email, name: serverSession.user.name } : undefined,
      };
    }
  } catch (e) {
    console.warn("[google-auth] getServerSession() failed:", e instanceof Error ? e.message : String(e));
  }
  return null;
}

export async function formatGoogleError(resp: Response, context: string): Promise<string> {
  const status = resp.status;
  if (status === 401) return "انتهت صلاحية الـ Google token. افصل واربط حسابك تاني من Integration Dashboard.";
  if (status === 403) {
    const body = await resp.text().catch(() => "");
    const hint = body.includes("insufficient authentication scopes") ? " الـ scope المطلوب مش ممنوح." : "";
    return `Google رفضت الوصول (${context}).${hint}`;
  }
  if (status === 429) return "تجاوزت حد الطلبات (rate limit). جرّب بعد دقيقة.";
  const body = await resp.text().catch(() => "");
  return `Google API error ${status} (${context}): ${body.slice(0, 200)}`;
}
