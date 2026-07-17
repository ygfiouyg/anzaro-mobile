import { NextResponse } from 'next/server'
import { ensureSeedData } from '@/lib/seed'

export async function POST() {
  try {
    await ensureSeedData()
    return NextResponse.json({ ok: true, message: 'Seed data ensured' })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
