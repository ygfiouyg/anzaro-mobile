import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeedData } from '@/lib/anzaro-seed'

export async function GET() {
  await ensureSeedData()
  const scenes = await db.moodScene.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ scenes })
}
