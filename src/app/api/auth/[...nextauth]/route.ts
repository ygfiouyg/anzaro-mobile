/**
 * NextAuth Catch-All Route Handler
 * ================================
 * Serves all NextAuth endpoints: /api/auth/signin, /api/auth/callback/google,
 * /api/auth/session, /api/auth/signout, /api/auth/csrf, /api/auth/providers.
 *
 * NOTE on coexistence with the legacy custom auth routes:
 * Static routes in the App Router always take precedence over a dynamic
 * catch-all. The existing `/api/auth/google`, `/api/auth/login`,
 * `/api/auth/logout`, `/api/auth/me` etc. keep working unchanged —
 * NextAuth only intercepts paths it owns (signin/signout/callback/session).
 */

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-nextauth";

const handler = NextAuth(authOptions);

// NextAuth needs both verbs on the same handler.
export { handler as GET, handler as POST };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
