/**
 * NextAuth type augmentation.
 * Adds `accessToken`, `refreshToken`, `expiresAt`, `scope` to the Session
 * and the corresponding fields to the JWT, so MCP tools can do:
 *   const session = await getServerSession(authOptions);
 *   const token = session?.accessToken;  // Google access_token
 */
import "next-auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number; // epoch seconds
    scope?: string;
    user?: DefaultSession["user"] & {
      provider?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
    provider?: string;
  }
}
