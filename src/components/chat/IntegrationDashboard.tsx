'use client';

/**
 * IntegrationDashboard — Omni-Integration Hub
 * ============================================
 * Premium, dark-themed, scrollable grid of every free OAuth provider
 * supported by the platform's NextAuth engine.
 *
 *   - Reads session state via `useSession()`.
 *   - Connected provider  → shows the account identity + "Disconnect" (signOut).
 *   - Disconnected        → "Connect" button → `signIn('provider_id')`.
 *
 * The provider list mirrors `src/lib/auth-nextauth.ts` so the dashboard and
 * the engine stay in sync.
 */

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  LogOut,
  PlugZap,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/* ── Provider catalogue ────────────────────────────────────────────────
 * `id` MUST match the provider key used in auth-nextauth.ts.
 * `glyph` is an inline SVG/emoji so we don't depend on icon CDN availability.
 * `category` drives the sectioned grid.
 */
type ProviderDef = {
  id: string;
  name: string;
  category: 'major' | 'dev' | 'content' | 'lifestyle' | 'regional';
  glyph: React.ReactNode;
  tint: string; // tailwind text-color class for the glyph
};

const PROVIDERS: ProviderDef[] = [
  // ── Major platforms ──
  { id: 'google', name: 'Google', category: 'major', tint: 'text-red-400', glyph: <GoogleG /> },
  { id: 'github', name: 'GitHub', category: 'major', tint: 'text-zinc-100', glyph: <Glyph path="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56v-2c-3.34.71-4.04-1.58-4.04-1.58-.55-1.36-1.34-1.73-1.34-1.73-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.3-5.47-5.8 0-1.28.47-2.33 1.23-3.15-.12-.3-.53-1.5.12-3.13 0 0 1-.32 3.3 1.2a11.6 11.6 0 0 1 6 0c2.3-1.52 3.3-1.2 3.3-1.2.65 1.63.24 2.83.12 3.13.77.82 1.23 1.87 1.23 3.15 0 4.51-2.81 5.5-5.49 5.79.43.36.81 1.09.81 2.2v3.26c0 .31.22.68.83.56A12.04 12.04 0 0 0 24 12.29C24 5.78 18.63.5 12 .5Z" /> },
  { id: 'facebook', name: 'Facebook', category: 'major', tint: 'text-blue-400', glyph: <Glyph path="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.8-4.66 4.53-4.66 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z" /> },
  { id: 'instagram', name: 'Instagram', category: 'major', tint: 'text-pink-400', glyph: <Glyph path="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38C1.35 2.67.94 3.34.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.85 5.85 0 0 0 2.12-1.38c.66-.66 1.08-1.33 1.38-2.12.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.85 5.85 0 0 0-1.38-2.12A5.85 5.85 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.41-10.4a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44Z" /> },
  { id: 'discord', name: 'Discord', category: 'major', tint: 'text-indigo-400', glyph: <Glyph path="M20.32 4.57A19.8 19.8 0 0 0 15.36 3l-.24.5a18.27 18.27 0 0 1 4.4 1.4 16.4 16.4 0 0 0-14.99 0 18.2 18.2 0 0 1 4.4-1.4L8.68 3a19.8 19.8 0 0 0-4.96 1.57C.9 9.4.1 14.1.5 18.74a19.9 19.9 0 0 0 6.06 3.05l.47-.65c-.41-.15-.8-.34-1.17-.55l.29-.22a14.2 14.2 0 0 0 12.13 0l.29.22c-.37.21-.76.4-1.17.55l.47.65a19.9 19.9 0 0 0 6.06-3.05c.5-5.36-.84-10.02-3.51-14.17ZM8.02 15.78c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4 2.17 1.08 2.15 2.4c0 1.32-.95 2.4-2.15 2.4Zm7.96 0c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4 2.17 1.08 2.15 2.4c0 1.32-.94 2.4-2.15 2.4Z" /> },
  { id: 'spotify', name: 'Spotify', category: 'major', tint: 'text-green-400', glyph: <Glyph path="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.31a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.52-.59 11.66 1.34.36.22.47.69.25 1.03Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.54-1.8c4.37-1.33 9.79-.68 13.49 1.6.44.27.58.85.31 1.29Zm.13-3.4C15.23 8.36 8.66 8.15 5.04 9.27a1.12 1.12 0 1 1-.65-2.15c4.16-1.27 11.4-1.02 15.9 1.66a1.12 1.12 0 0 1-1.15 1.93Z" /> },
  { id: 'reddit', name: 'Reddit', category: 'major', tint: 'text-orange-400', glyph: <Glyph path="M24 12c0-1.3-1.04-2.35-2.32-2.35-.63 0-1.2.25-1.62.66-1.6-1.1-3.78-1.81-6.2-1.9l1.06-5.02 3.5.74a1.66 1.66 0 1 0 .17-.98l-3.9-.82a.49.49 0 0 0-.58.39l-1.18 5.59c-2.44.08-4.64.78-6.26 1.9-.42-.4-1-.65-1.62-.65A2.33 2.33 0 0 0 0 12c0 .93.55 1.74 1.34 2.12a4.6 4.6 0 0 0-.06.74c0 3.78 4.4 6.84 9.84 6.84s9.84-3.06 9.84-6.84a4.6 4.6 0 0 0-.06-.74A2.34 2.34 0 0 0 24 12Zm-15.6 1.56a1.56 1.56 0 1 1 3.12 0 1.56 1.56 0 0 1-3.12 0Zm8.6 0a1.56 1.56 0 1 1-3.12 0 1.56 1.56 0 0 1 3.12 0Zm-.24 4.18a.47.47 0 0 1 .08.65c-1.04 1.4-2.95 2.08-5.84 2.08s-4.8-.69-5.84-2.08a.47.47 0 1 1 .73-.58c.84 1.14 2.5 1.71 5.11 1.71s4.27-.57 5.11-1.71a.47.47 0 0 1 .65-.07Z" /> },
  { id: 'slack', name: 'Slack', category: 'major', tint: 'text-purple-400', glyph: <Glyph path="M5.04 15.06a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.28 0a2.52 2.52 0 1 1 5.04 0v6.3a2.52 2.52 0 1 1-5.04 0v-6.3ZM8.84 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52H8.84Zm0 1.28a2.52 2.52 0 1 1 0 5.04H2.52a2.52 2.52 0 1 1 0-5.04h6.32ZM18.96 8.84a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.84Zm-1.28 0a2.52 2.52 0 1 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.32ZM15.16 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.28a2.52 2.52 0 1 1 0-5.04h6.32a2.52 2.52 0 1 1 0 5.04h-6.32Z" /> },
  { id: 'linkedin', name: 'LinkedIn', category: 'major', tint: 'text-blue-400', glyph: <Glyph path="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.8 0 0 .78 0 1.74v20.5C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.76V1.74C24 .78 23.2 0 22.22 0Z" /> },
  { id: 'twitch', name: 'Twitch', category: 'major', tint: 'text-purple-400', glyph: <Glyph path="M2.15 0 .5 4.13v19.13h6.13V24h3.46l3.4-2.74h4.65L23.5 16V0H2.15Zm19.04 14.84-3.18 3.18h-4.34l-3.4 2.74v-2.74H6.42V2.15h14.77v12.69ZM17.6 5.85h-2.15v6.13h2.15V5.85Zm-5.85 0H9.6v6.13h2.15V5.85Z" /> },

  // ── Dev + productivity ──
  { id: 'gitlab', name: 'GitLab', category: 'dev', tint: 'text-orange-400', glyph: <Glyph path="m23.6 9.6-.03-.09L20.32.86a.85.85 0 0 0-.82-.57.85.85 0 0 0-.81.57l-2.2 6.74H7.55L5.35.86a.85.85 0 0 0-.81-.57c-.37 0-.7.23-.82.57L.44 9.5l-.03.1c-.1.32 0 .67.27.88l11.05 8.03c.16.12.38.12.54 0l11.05-8.03c.27-.21.37-.56.27-.88ZM8.42 14.05l3.37 6.05-7.83-6.05h4.46Zm10.99 0-7.83 6.05 3.37-6.05h4.46Zm-9.84 0h-4.4L12 7.04l-2.43 7.01ZM14.43 7.04l2.43 7.01h-4.86l2.43-7.01Z" /> },
  { id: 'dropbox', name: 'Dropbox', category: 'dev', tint: 'text-blue-400', glyph: <Glyph path="M6 0 0 4l6 4 6-4-6-4Zm12 0-6 4 6 4 6-4-6-4ZM0 12l6 4 6-4-6-4-6 4Zm18-4-6 4 6 4 6-4-6-4ZM6 18l6 4 6-4-6-4-6 4Z" /> },
  { id: 'notion', name: 'Notion', category: 'dev', tint: 'text-zinc-100', glyph: <Glyph path="M4.46 0 21 1.78v18.5L4.46 22.3V0Zm1.5 1.65v18.95l13.5-1.73V3.2L5.96 1.65ZM8.7 4.5l6.2.55-.08 1.45-2.02-.18v6.4l1.7.14-.07 1.45-4.65-.4v-1.45l1.7.14V6.5l-1.85-.17.07-1.45Z" /> },
  { id: 'zoom', name: 'Zoom', category: 'dev', tint: 'text-blue-400', glyph: <Glyph path="M.4 0A.4.4 0 0 0 0 .4v13.2c0 .22.18.4.4.4h11.2a.4.4 0 0 0 .4-.4V.4a.4.4 0 0 0-.4-.4H.4Zm16.5 4.5-4 2.86v3.28l4 2.86V4.5ZM23 5.5l-5 3.57v1.86l5 3.57V5.5Z" /> },
  { id: 'netlify', name: 'Netlify', category: 'dev', tint: 'text-teal-400', glyph: <Glyph path="M16.83 0 0 16.83 7.17 24 24 7.17 16.83 0Zm-4.13 4.13 7.17 7.17-2.04 2.04-7.17-7.17 2.04-2.04ZM6.7 10.13l7.17 7.17-2.04 2.04-7.17-7.17 2.04-2.04Z" /> },
  { id: 'box', name: 'Box', category: 'dev', tint: 'text-blue-400', glyph: <Glyph path="M3.31 7.56 12 12l8.69-4.44L12 3.12 3.31 7.56ZM0 7.56 12 1.56l12 6-12 6L0 7.56Zm0 8.88L12 10.44l12 6L12 22.44 0 16.44Z" /> },
  { id: 'todoist', name: 'Todoist', category: 'dev', tint: 'text-red-400', glyph: <Glyph path="M0 4.59v14.82L12 24l12-4.59V4.59L12 0 0 4.59Zm12 6.21L3.43 6.94 12 3.66l8.57 3.28L12 10.8Z" /> },
  { id: 'zoho', name: 'Zoho', category: 'dev', tint: 'text-red-400', glyph: <Glyph path="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm0 5.5c3.6 0 6.5 2.9 6.5 6.5S15.6 18.5 12 18.5 5.5 15.6 5.5 12 8.4 5.5 12 5.5Z" /> },

  // ── Content + creators ──
  { id: 'pinterest', name: 'Pinterest', category: 'content', tint: 'text-red-400', glyph: <Glyph path="M12 0a12 12 0 0 0-4.37 23.17c-.1-.94-.2-2.4.04-3.42.22-.93 1.4-5.95 1.4-5.95s-.36-.72-.36-1.78c0-1.66.97-2.9 2.17-2.9 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-1 4-.28 1.2.6 2.17 1.78 2.17 2.14 0 3.78-2.26 3.78-5.51 0-2.88-2.07-4.9-5.03-4.9-3.43 0-5.44 2.57-5.44 5.23 0 1.04.4 2.15.9 2.75a.36.36 0 0 1 .08.35c-.09.37-.3 1.2-.34 1.36-.05.22-.18.27-.4.16-1.5-.7-2.44-2.88-2.44-4.64 0-3.78 2.74-7.25 7.92-7.25 4.16 0 7.39 2.96 7.39 6.92 0 4.13-2.6 7.46-6.22 7.46-1.21 0-2.35-.63-2.74-1.38l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15A12 12 0 1 0 12 0Z" /> },
  { id: 'patreon', name: 'Patreon', category: 'content', tint: 'text-orange-400', glyph: <Glyph path="M0 0v24h5.5V0H0Zm12.5 0C7.25 0 3 4.25 3 9.5S7.25 19 12.5 19 22 14.75 22 9.5 17.75 0 12.5 0Z" /> },
  { id: 'medium', name: 'Medium', category: 'content', tint: 'text-zinc-100', glyph: <Glyph path="M2.85 2.85h18.3v18.3H2.85V2.85Zm16 16V5.15H5.15v13.7h13.7Z" /> },
  { id: 'wikimedia', name: 'Wikimedia', category: 'content', tint: 'text-zinc-300', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },

  // ── Lifestyle (health + gaming) ──
  { id: 'strava', name: 'Strava', category: 'lifestyle', tint: 'text-orange-400', glyph: <Glyph path="M15.39 0H8.61L4.5 9.04h4.36L15.39 0Zm.18 24L11.3 14.96 13.5 9.6l6.01 14.4h-4.86Z" /> },
  { id: 'battlenet', name: 'Battle.net', category: 'lifestyle', tint: 'text-blue-400', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },
  { id: 'eveonline', name: 'EVE Online', category: 'lifestyle', tint: 'text-zinc-200', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },
  { id: 'trakt', name: 'Trakt', category: 'lifestyle', tint: 'text-red-400', glyph: <Glyph path="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm0 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z" /> },
  { id: 'osu', name: 'osu!', category: 'lifestyle', tint: 'text-pink-400', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },

  // ── Regional + finance ──
  { id: 'yandex', name: 'Yandex', category: 'regional', tint: 'text-red-400', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },
  { id: 'vk', name: 'VK', category: 'regional', tint: 'text-blue-400', glyph: <Glyph path="M2 2h20v20H2V2Zm10 5.5c3 0 5 2 5 4.5s-2 4.5-5 4.5-5-2-5-4.5 2-4.5 5-4.5Z" /> },
  { id: 'naver', name: 'Naver', category: 'regional', tint: 'text-green-400', glyph: <Glyph path="M2 2h20v20H2V2Zm5 5v10l5-5V7H7Z" /> },
  { id: 'kakao', name: 'Kakao', category: 'regional', tint: 'text-yellow-400', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },
  { id: 'line', name: 'LINE', category: 'regional', tint: 'text-green-400', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },
  { id: 'coinbase', name: 'Coinbase', category: 'regional', tint: 'text-blue-400', glyph: <Glyph path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /> },
];

const CATEGORY_META: Record<ProviderDef['category'], { label: string; hint: string }> = {
  major: { label: 'المنصات الرئيسية', hint: 'Google · GitHub · Discord · Spotify وغيرها' },
  dev: { label: 'تطوير وإنتاجية', hint: 'GitLab · Notion · Dropbox · Zoom' },
  content: { label: 'محتوى وإبداع', hint: 'Pinterest · Patreon · Medium' },
  lifestyle: { label: 'لياقة وألعاب', hint: 'Strava · Battle.net · osu!' },
  regional: { label: 'إقليمية ومالية', hint: 'Yandex · Naver · Kakao · Coinbase' },
};

export function IntegrationDashboard() {
  const { data: session, status } = useSession();
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const connectedId = status === 'authenticated' && session?.accessToken ? (session.user as any)?.provider ?? null : null;
  const loading = status === 'loading';

  const handleConnect = (id: string) => {
    setPending(id);
    // V.47: Use our custom /api/auth/google route for Google (saves tokens in DB)
    if (id === 'google') {
      window.location.assign('/api/auth/google');
    } else {
      void signIn(id, { callbackUrl: '/' });
    }
  };
  const handleDisconnect = () => {
    setPending('disconnect');
    // V.47: For Google, just reload — the session cookie will be checked
    if (connectedId === 'google') {
      window.location.assign('/?google_disconnect=1');
    } else {
      void signOut({ callbackUrl: '/', redirect: true });
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROVIDERS;
    return PROVIDERS.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q));
  }, [query]);

  const grouped = useMemo(() => {
    const map: Record<ProviderDef['category'], ProviderDef[]> = { major: [], dev: [], content: [], lifestyle: [], regional: [] };
    for (const p of filtered) map[p.category].push(p);
    return map;
  }, [filtered]);

  return (
    <div className="w-full">
      {/* ── Hero header ─────────────────────────────────────────── */}
      <div
        dir="rtl"
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-5 sm:p-6 shadow-[0_0_40px_-12px_rgba(59,130,246,0.35)]"
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-56 rounded-full blur-3xl opacity-30 bg-blue-500" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-16 size-48 rounded-full blur-3xl opacity-20 bg-fuchsia-500" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur">
              <PlugZap className="size-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold leading-tight text-zinc-50">
                مركز الربط الشامل
              </h3>
              <p className="mt-0.5 text-[11px] font-medium text-zinc-400">
                {PROVIDERS.length} مزوّد OAuth — اربط حساباتك وخلّي الـ assistant يستخدمها
              </p>
            </div>
          </div>
          {connectedId ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              <CheckCircle2 className="size-3" />
              متصل
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-[10px] font-semibold text-zinc-400 ring-1 ring-zinc-400/20">
              <CircleDashed className="size-3" />
              {loading ? 'جارٍ الفحص' : 'غير متصل'}
            </span>
          )}
        </div>

        {/* Connected identity banner */}
        {connectedId && session?.user ? (
          <div className="relative mt-4 flex items-center gap-3 rounded-xl bg-emerald-500/[0.06] p-3 ring-1 ring-emerald-400/20">
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-xs font-bold text-white">
              {(session.user.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-zinc-100">
                {session.user.name ?? 'مستخدم'} · <span className="text-emerald-300">{connectedId}</span>
              </p>
              <p className="truncate text-[11px] text-zinc-400">{session.user.email ?? '—'}</p>
            </div>
            <Button
              onClick={handleDisconnect}
              disabled={pending !== null}
              className="h-8 rounded-lg bg-white/5 px-3 text-xs text-zinc-100 ring-1 ring-white/10 hover:bg-red-500/15 hover:text-red-200 hover:ring-red-400/30"
            >
              {pending === 'disconnect' ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5 ml-1" />}
              إلغاء الربط
            </Button>
          </div>
        ) : null}

        {/* Search */}
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن مزوّد..."
            className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] pr-9 pl-3 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-blue-400/40 focus:outline-none focus:ring-1 focus:ring-blue-400/30"
          />
        </div>
      </div>

      {/* ── Scrollable provider grid ────────────────────────────── */}
      <div dir="rtl" className="mt-4 max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 bg-zinc-950/40 p-4 gemini-dropdown-scroll">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-zinc-500">مفيش مزوّد مطابق للبحث.</p>
        ) : (
          <div className="space-y-5">
            {(Object.keys(grouped) as ProviderDef['category'][]).map((cat) =>
              grouped[cat].length === 0 ? null : (
                <section key={cat}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      {CATEGORY_META[cat].label}
                    </h4>
                    <span className="text-[10px] text-zinc-600">{CATEGORY_META[cat].hint}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {grouped[cat].map((p) => {
                      const isConn = connectedId === p.id;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            'group relative flex flex-col gap-2 rounded-xl border p-3 transition-all',
                            isConn
                              ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn('flex size-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 [&>svg]:size-4', p.tint)}>
                              {p.glyph}
                            </span>
                            <span className="flex-1 truncate text-[12px] font-medium text-zinc-100">{p.name}</span>
                            {isConn ? (
                              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                            ) : null}
                          </div>
                          <Button
                            onClick={() => (isConn ? handleDisconnect() : handleConnect(p.id))}
                            disabled={pending !== null}
                            className={cn(
                              'h-7 w-full rounded-lg text-[11px] font-medium transition-colors',
                              isConn
                                ? 'bg-white/5 text-zinc-300 ring-1 ring-white/10 hover:bg-red-500/15 hover:text-red-200'
                                : 'bg-white text-zinc-900 hover:bg-zinc-200',
                            )}
                          >
                            {pending === p.id || (pending === 'disconnect' && isConn) ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : isConn ? (
                              <><LogOut className="size-3 ml-1" />إلغاء</>
                            ) : (
                              <><PlugZap className="size-3 ml-1" />ربط</>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ),
            )}
          </div>
        )}
      </div>

      {/* Debug button — يـ fetch الـ session info ويعرضها */}
      <details className="mt-2 group">
        <summary className="cursor-pointer text-[10px] text-zinc-500 hover:text-zinc-300 text-center list-none">
          🔍 Debug session info
        </summary>
        <button
          onClick={async () => {
            try {
              const r = await fetch('/api/auth/debug-session');
              const data = await r.json();
              const text = JSON.stringify(data, null, 2);
              alert(text);
            } catch (e) {
              alert('Error: ' + (e instanceof Error ? e.message : String(e)));
            }
          }}
          className="mt-2 w-full rounded-lg bg-white/5 px-3 py-1.5 text-[11px] text-zinc-300 ring-1 ring-white/10 hover:bg-white/10"
        >
          عرض معلومات الـ session
        </button>
      </details>

      {/* Footer note */}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-zinc-500">
        <ShieldCheck className="size-3 text-zinc-600" />
        الـ tokens بتتخزّن بشكل آمن في الـ JWT session. اربط حساب واحد في كل مرة.
      </p>
    </div>
  );
}

/* ── Inline glyph helpers (no icon-CDN dependency) ──────────────────── */
function Glyph({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  );
}
function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export default IntegrationDashboard;
