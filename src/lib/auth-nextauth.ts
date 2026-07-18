/**
 * NextAuth.js Engine — Omni-Integration Hub
 * ==========================================
 * "Bring Your Own Account" flow for a massive array of free OAuth providers.
 *
 * Every provider uses a `process.env.<NAME>_CLIENT_ID || 'PENDING'` fallback
 * so the server NEVER crashes when a provider's keys aren't in .env yet.
 * NextAuth will still list the provider, but the OAuth dance will fail with
 * a clear "invalid_client" error from the provider until real keys are added.
 *
 * Google keeps its omni-scope grant (Drive/Sheets/Docs/Tasks/Calendar) so
 * downstream MCP tools can pull the access_token from the session.
 *
 * EXCLUDED by design:
 *   - Apple    → requires $99/yr developer account
 *   - Twitter  → paid API tiers only
 *   - Enterprise self-hosted IdPs (Auth0, Cognito, Keycloak, Okta, Zitadel,
 *     Azure AD, OneLogin, etc.) → need your own tenant, not a "free provider"
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import FacebookProvider from "next-auth/providers/facebook";
import InstagramProvider from "next-auth/providers/instagram";
import DiscordProvider from "next-auth/providers/discord";
import SpotifyProvider from "next-auth/providers/spotify";
import RedditProvider from "next-auth/providers/reddit";
import SlackProvider from "next-auth/providers/slack";
import LinkedInProvider from "next-auth/providers/linkedin";
import TwitchProvider from "next-auth/providers/twitch";
import GitLabProvider from "next-auth/providers/gitlab";
import DropboxProvider from "next-auth/providers/dropbox";
import ZoomProvider from "next-auth/providers/zoom";
// Notion has no built-in provider in next-auth v4 — use the generic OAuth2Config.
import type { OAuth2Config } from "next-auth/providers";
import type { Profile } from "next-auth";
import PinterestProvider from "next-auth/providers/pinterest";
import PatreonProvider from "next-auth/providers/patreon";
import StravaProvider from "next-auth/providers/strava";
import MediumProvider from "next-auth/providers/medium";
import YandexProvider from "next-auth/providers/yandex";
import VKProvider from "next-auth/providers/vk";
import NaverProvider from "next-auth/providers/naver";
import KakaoProvider from "next-auth/providers/kakao";
import LineProvider from "next-auth/providers/line";
import BattleNetProvider from "next-auth/providers/battlenet";
import EveOnlineProvider from "next-auth/providers/eveonline";
import TraktProvider from "next-auth/providers/trakt";
import OsuProvider from "next-auth/providers/osu";
import WikimediaProvider from "next-auth/providers/wikimedia";
import CoinbaseProvider from "next-auth/providers/coinbase";
import ZohoProvider from "next-auth/providers/zoho";
import NetlifyProvider from "next-auth/providers/netlify";
import BoxProvider from "next-auth/providers/box";
import TodoistProvider from "next-auth/providers/todoist";

/**
 * The exact scope string requested from Google.
 *
 * SECURITY: We deliberately AVOID the full `auth/drive` scope, which Google
 * classifies as a *restricted* scope and would trigger the unverified-app
 * warning + a formal CASA security assessment. Instead we request the two
 * *sensitive* (non-restricted) Drive scopes:
 *
 *   - drive.readonly  → read existing files the user grants access to
 *   - drive.file      → create / read / write files created BY this app
 */
export const GOOGLE_OMNI_SCOPES =
  "openid email profile " +
  "https://www.googleapis.com/auth/drive.readonly " +
  "https://www.googleapis.com/auth/drive.file " +
  "https://www.googleapis.com/auth/spreadsheets " +
  "https://www.googleapis.com/auth/documents " +
  "https://www.googleapis.com/auth/tasks " +
  "https://www.googleapis.com/auth/calendar " +
  "https://www.googleapis.com/auth/contacts.readonly";

/** Sentinel: providers without configured keys still register (non-crashing). */
const PENDING = "PENDING";
const env = (v: string | undefined): string => (v && v.trim() ? v : PENDING);

/**
 * الـ secret اللي بيتستخدم في تشفير الـ JWT cookies.
 * لازم يكون ثابت عبر كل restarts — لو مش متاح كـ env var، NextAuth بتعمل
 * secret عشوائي جديد كل restart → كل الـ sessions بتضيع.
 *
 * لو مش متاح، بنولّد واحد ثابت من الـ Google credentials (عشان يفضل نفسه
 * عبر restarts بدل ما NextAuth يولّد واحد عشوائي جديد).
 */
function getStableSecret(): string {
  const envSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (envSecret) return envSecret;

  // fallback: hash ثابت من الـ Google credentials (نفسه عبر restarts)
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
  const generated = `anzaro-fallback-${Math.abs(hash).toString(16).padStart(16, "0")}-${source.length}`;
  console.warn("[next-auth] ⚠️ NEXTAUTH_SECRET مش متاح — مستخدمين fallback ثابت. ضيف NEXTAUTH_SECRET في HF Spaces Settings عشان الـ sessions تفضل دائمة.");
  return generated;
}

/**
 * Notion — generic OAuth2 config (no built-in provider in next-auth v4).
 * Notion's OAuth uses "internal integration" credentials.
 */
const NotionProvider: OAuth2Config<Profile> = {
  id: "notion",
  name: "Notion",
  type: "oauth",
  clientId: env(process.env.NOTION_CLIENT_ID),
  clientSecret: env(process.env.NOTION_CLIENT_SECRET),
  authorization: {
    url: "https://api.notion.com/v1/oauth/authorize",
    params: { owner: "user", response_type: "code" },
  },
  token: "https://api.notion.com/v1/oauth/token",
  userinfo: "https://api.notion.com/v1/users/me",
  profile(profile) {
    return {
      id: profile.sub ?? (profile as any).id ?? "notion-user",
      name: (profile as any).name ?? "Notion User",
      email: (profile as any).email ?? null,
      image: (profile as any).avatar_url ?? null,
    };
  },
};

export const authOptions: NextAuthOptions = {
  providers: [
    // ── Tier 1: Major platforms (configured) ───────────────────────
    GoogleProvider({
      clientId: env(process.env.GOOGLE_CLIENT_ID),
      clientSecret: env(process.env.GOOGLE_CLIENT_SECRET),
      authorization: {
        params: {
          scope: GOOGLE_OMNI_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),

    GitHubProvider({
      clientId: env(process.env.GITHUB_CLIENT_ID),
      clientSecret: env(process.env.GITHUB_CLIENT_SECRET),
    }),

    FacebookProvider({
      clientId: env(process.env.FACEBOOK_CLIENT_ID),
      clientSecret: env(process.env.FACEBOOK_CLIENT_SECRET),
    }),

    InstagramProvider({
      clientId: env(process.env.INSTAGRAM_CLIENT_ID),
      clientSecret: env(process.env.INSTAGRAM_CLIENT_SECRET),
    }),

    DiscordProvider({
      clientId: env(process.env.DISCORD_CLIENT_ID),
      clientSecret: env(process.env.DISCORD_CLIENT_SECRET),
    }),

    SpotifyProvider({
      clientId: env(process.env.SPOTIFY_CLIENT_ID),
      clientSecret: env(process.env.SPOTIFY_CLIENT_SECRET),
    }),

    RedditProvider({
      clientId: env(process.env.REDDIT_CLIENT_ID),
      clientSecret: env(process.env.REDDIT_CLIENT_SECRET),
      // Reddit requires a stable user agent.
      authorization: { params: { duration: "permanent" } },
    }),

    SlackProvider({
      clientId: env(process.env.SLACK_CLIENT_ID),
      clientSecret: env(process.env.SLACK_CLIENT_SECRET),
    }),

    LinkedInProvider({
      clientId: env(process.env.LINKEDIN_CLIENT_ID),
      clientSecret: env(process.env.LINKEDIN_CLIENT_SECRET),
    }),

    TwitchProvider({
      clientId: env(process.env.TWITCH_CLIENT_ID),
      clientSecret: env(process.env.TWITCH_CLIENT_SECRET),
    }),

    // ── Tier 2: Dev + productivity ────────────────────────────────
    GitLabProvider({
      clientId: env(process.env.GITLAB_CLIENT_ID),
      clientSecret: env(process.env.GITLAB_CLIENT_SECRET),
    }),

    DropboxProvider({
      clientId: env(process.env.DROPBOX_CLIENT_ID),
      clientSecret: env(process.env.DROPBOX_CLIENT_SECRET),
    }),

    NotionProvider,

    ZoomProvider({
      clientId: env(process.env.ZOOM_CLIENT_ID),
      clientSecret: env(process.env.ZOOM_CLIENT_SECRET),
    }),

    NetlifyProvider({
      clientId: env(process.env.NETLIFY_CLIENT_ID),
      clientSecret: env(process.env.NETLIFY_CLIENT_SECRET),
    }),

    BoxProvider({
      clientId: env(process.env.BOX_CLIENT_ID),
      clientSecret: env(process.env.BOX_CLIENT_SECRET),
    }),

    TodoistProvider({
      clientId: env(process.env.TODOIST_CLIENT_ID),
      clientSecret: env(process.env.TODOIST_CLIENT_SECRET),
    }),

    ZohoProvider({
      clientId: env(process.env.ZOHO_CLIENT_ID),
      clientSecret: env(process.env.ZOHO_CLIENT_SECRET),
    }),

    // ── Tier 3: Content + creators ────────────────────────────────
    PinterestProvider({
      clientId: env(process.env.PINTEREST_CLIENT_ID),
      clientSecret: env(process.env.PINTEREST_CLIENT_SECRET),
    }),

    PatreonProvider({
      clientId: env(process.env.PATREON_CLIENT_ID),
      clientSecret: env(process.env.PATREON_CLIENT_SECRET),
    }),

    MediumProvider({
      clientId: env(process.env.MEDIUM_CLIENT_ID),
      clientSecret: env(process.env.MEDIUM_CLIENT_SECRET),
    }),

    WikimediaProvider({
      clientId: env(process.env.WIKIMEDIA_CLIENT_ID),
      clientSecret: env(process.env.WIKIMEDIA_CLIENT_SECRET),
    }),

    // ── Tier 4: Health + gaming ───────────────────────────────────
    StravaProvider({
      clientId: env(process.env.STRAVA_CLIENT_ID),
      clientSecret: env(process.env.STRAVA_CLIENT_SECRET),
    }),

    BattleNetProvider({
      clientId: env(process.env.BATTLENET_CLIENT_ID),
      clientSecret: env(process.env.BATTLENET_CLIENT_SECRET),
    }),

    EveOnlineProvider({
      clientId: env(process.env.EVEONLINE_CLIENT_ID),
      clientSecret: env(process.env.EVEONLINE_CLIENT_SECRET),
    }),

    TraktProvider({
      clientId: env(process.env.TRAKT_CLIENT_ID),
      clientSecret: env(process.env.TRAKT_CLIENT_SECRET),
    }),

    OsuProvider({
      clientId: env(process.env.OSU_CLIENT_ID),
      clientSecret: env(process.env.OSU_CLIENT_SECRET),
    }),

    // ── Tier 5: Regional + finance ────────────────────────────────
    YandexProvider({
      clientId: env(process.env.YANDEX_CLIENT_ID),
      clientSecret: env(process.env.YANDEX_CLIENT_SECRET),
    }),

    VKProvider({
      clientId: env(process.env.VK_CLIENT_ID),
      clientSecret: env(process.env.VK_CLIENT_SECRET),
    }),

    NaverProvider({
      clientId: env(process.env.NAVER_CLIENT_ID),
      clientSecret: env(process.env.NAVER_CLIENT_SECRET),
    }),

    KakaoProvider({
      clientId: env(process.env.KAKAO_CLIENT_ID),
      clientSecret: env(process.env.KAKAO_CLIENT_SECRET),
    }),

    LineProvider({
      clientId: env(process.env.LINE_CLIENT_ID),
      clientSecret: env(process.env.LINE_CLIENT_SECRET),
    }),

    CoinbaseProvider({
      clientId: env(process.env.COINBASE_CLIENT_ID),
      clientSecret: env(process.env.COINBASE_CLIENT_SECRET),
    }),
  ],

  // Stateless JWT strategy — no DB adapter required, survives HF Spaces reboots.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    /**
     * jwt() — stash the access_token / refresh_token / expiry onto the JWT.
     * + بتعمل refresh للـ access_token لو قرب يخلص (Google tokens بتنتهي بعد 1 ساعة).
     */
    async jwt({ token, account }) {
      // أول sign-in: خزّن كل حاجة
      if (account) {
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at = account.expires_at; // epoch seconds
        token.scope = account.scope;
        token.token_type = account.token_type;
        token.id_token = account.id_token;
        token.provider = account.provider;
        return token;
      }

      // لو الـ access_token لسه شغال (مخلصش) → رجّعه زي ما هو
      const expiresAt = token.expires_at as number | undefined;
      if (expiresAt && Date.now() / 1000 < expiresAt - 300) {
        // لسه فيه 5 دقايق على الأقل قبل الـ expiry
        return token;
      }

      // الـ access_token خلص أو قرب يخلص → اعمل refresh
      const refreshToken = token.refresh_token as string | undefined;
      if (!refreshToken) {
        // مفيش refresh_token → رجّع الـ token زي ما هو (هيـ fail في الأداة بس مش هنسession)
        console.warn("[next-auth] access_token expired + no refresh_token — session invalid");
        return token;
      }

      console.log("[next-auth] access_token expired — refreshing...");
      try {
        const resp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID ?? "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });
        if (!resp.ok) {
          console.warn("[next-auth] refresh failed:", resp.status, await resp.text().catch(() => ""));
          return token;
        }
        const refreshed = (await resp.json()) as {
          access_token: string;
          expires_in: number;
          refresh_token?: string;
        };
        token.access_token = refreshed.access_token;
        token.expires_at = Math.floor(Date.now() / 1000) + refreshed.expires_in;
        if (refreshed.refresh_token) token.refresh_token = refreshed.refresh_token;
        console.log("[next-auth] ✅ access_token refreshed, new expiry:", new Date((token.expires_at as number) * 1000).toISOString());
        return token;
      } catch (e) {
        console.warn("[next-auth] refresh error:", e instanceof Error ? e.message : String(e));
        return token;
      }
    },

    /**
     * session() — forward the access_token from the JWT into the client-visible
     * session. MCP tools read `session.accessToken` to call upstream APIs.
     */
    async session({ session, token }) {
      session.accessToken = token.access_token as string | undefined;
      session.refreshToken = token.refresh_token as string | undefined;
      session.expiresAt = token.expires_at as number | undefined;
      session.scope = token.scope as string | undefined;
      if (session.user) {
        (session.user as any).provider = token.provider;
      }
      return session;
    },
  },

  secret: getStableSecret(),
  pages: {
    error: "/api/auth/error",
  },
};

export default authOptions;
