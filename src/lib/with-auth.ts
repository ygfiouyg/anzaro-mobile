// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Route Protection Higher-Order Function
// ═══════════════════════════════════════════════════════════════════════
// Wraps Next.js App Router route handlers to automatically:
//   1. Extract the Bearer token from the Authorization header
//   2. Validate the token and look up the user
//   3. Return 401 if no valid token (for protected routes)
//   4. Inject the user object into the handler context
//   5. Support `allowGuest: true` for routes that allow unauthenticated
//      access (e.g. chat stream with guest mode)
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';

// ── Types ──────────────────────────────────────────────────────────────

/** The Prisma User type */
export type AuthUser = NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>>;

/** Context object injected into the wrapped handler */
export interface AuthContext {
  /** The authenticated user, or null if allowGuest is true and no token provided */
  user: AuthUser | null;
}

/** Options for the withAuth wrapper */
export interface WithAuthOptions {
  /**
   * If true, unauthenticated requests are allowed through.
   * The `user` in context will be null for guests.
   * Useful for endpoints like chat stream that support guest mode.
   * @default false
   */
  allowGuest?: boolean;

  /**
   * If true, only admin users are allowed. Regular authenticated users
   * will receive 403 Forbidden.
   * @default false
   */
  requireAdmin?: boolean;
}

/** Signature of a handler wrapped by withAuth.
 *  Receives request + merged context (route params + auth user).
 *  Uses `any` for context so each handler can type its own params.
 *  Returns Response (not NextResponse) for broader compatibility. */
export type AuthenticatedHandler = (
  request: NextRequest,
  context: any
) => Promise<Response | NextResponse> | Response | NextResponse;

// ── Implementation ─────────────────────────────────────────────────────

/**
 * Higher-order function that wraps a Next.js App Router handler with
 * authentication logic.
 *
 * @param handler - The route handler to wrap. Receives the request and an
 *                  AuthContext with the authenticated user.
 * @param options - Configuration options for auth behavior.
 * @returns A Next.js route handler function compatible with App Router exports.
 *
 * @example
 * // Protected route — requires authentication
 * export const POST = withAuth(async (request, { user }) => {
 *   // user is guaranteed to be non-null here
 *   return NextResponse.json({ message: `Hello ${user.name}` });
 * });
 *
 * @example
 * // Guest-allowed route — works with or without auth
 * export const POST = withAuth(async (request, { user }) => {
 *   // user may be null for guests
 *   const isGuest = !user;
 *   return NextResponse.json({ guest: isGuest });
 * }, { allowGuest: true });
 *
 * @example
 * // Admin-only route
 * export const GET = withAuth(async (request, { user }) => {
 *   // user is guaranteed to be an admin
 *   return NextResponse.json({ admin: user.name });
 * }, { requireAdmin: true });
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options?: WithAuthOptions
): (request: NextRequest, context?: any) => Promise<NextResponse> {
  const { allowGuest = false, requireAdmin = false } = options ?? {};

  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    // ── Step 1: Extract Bearer token ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);

    // ── Step 2: Validate token and look up user ──
    let user: AuthUser | null = null;

    if (token) {
      user = await getUserFromToken(token);
    }

    // ── Step 3: Enforce authentication requirement ──
    if (!user && !allowGuest) {
      return NextResponse.json(
        {
          error: 'مطلوب مصادقة',
          message: 'Authentication required. Provide a valid Bearer token.',
        },
        { status: 401 }
      );
    }

    // ── Step 4: Enforce admin requirement ──
    if (requireAdmin && user && user.role !== 'admin') {
      return NextResponse.json(
        {
          error: 'تم رفض الوصول',
          message: 'Admin access required.',
        },
        { status: 403 }
      );
    }

    // Edge case: requireAdmin but no user (and allowGuest is true)
    // In this case, guest can't be admin — return 403
    if (requireAdmin && !user) {
      return NextResponse.json(
        {
          error: 'مطلوب مصادقة',
          message: 'Admin authentication required.',
        },
        { status: 403 }
      );
    }

    // ── Step 5: Call the wrapped handler with merged context (route params + auth) ──
    try {
      return await handler(request, { ...context, user });
    } catch (error) {
      // Let the handler handle its own errors, but provide a safety net
      // for uncaught errors to avoid leaking stack traces
      console.error('[withAuth] Unhandled error in protected handler:', error);
      return NextResponse.json(
        {
          error: 'خطأ داخلي في الخادم',
          message: 'Internal server error',
        },
        { status: 500 }
      );
    }
  };
}
