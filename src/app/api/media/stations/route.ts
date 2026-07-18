import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeedData } from '@/lib/seed'

export async function GET() {
  await ensureSeedData()
  const stations = await db.radioStation.findMany({ where: { isActive: true }, orderBy: { category: 'asc' } })
  return NextResponse.json({ stations })
}
