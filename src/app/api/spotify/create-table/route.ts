/**
 * POST /api/spotify/create-table
 * ينشئ جدول spotify_tokens في الـ DB (لو مش موجود)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "spotify_tokens" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "accessToken" TEXT NOT NULL,
        "refreshToken" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "scope" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "spotify_tokens_pkey" PRIMARY KEY ("id")
      );
    `);
    
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "spotify_tokens" ADD CONSTRAINT "spotify_tokens_userId_key" UNIQUE ("userId");`);
    } catch {}
    
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "spotify_tokens" ADD CONSTRAINT "spotify_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;`);
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
