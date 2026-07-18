import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeedData } from '@/lib/seed'

export async function GET() {
  await ensureSeedData()
  const tools = await db.mcpTool.findMany({ orderBy: { category: 'asc' } })
  const grouped: Record<string, typeof tools> = {}
  for (const t of tools) {
    grouped[t.category] = grouped[t.category] ? [...grouped[t.category], t] : [t]
  }
  return NextResponse.json({ tools, grouped })
}
