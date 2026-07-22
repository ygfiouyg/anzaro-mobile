import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const cols = await db.$queryRawUnsafe(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('MoodScene', 'Routine', 'Device', 'PersonalityProfile')
      ORDER BY table_name, ordinal_position
    `) as any[]
    const grouped: Record<string, string[]> = {}
    for (const r of cols) {
      if (!grouped[r.table_name]) grouped[r.table_name] = []
      grouped[r.table_name].push(r.column_name)
    }
    return NextResponse.json({ ok: true, tables: grouped })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
