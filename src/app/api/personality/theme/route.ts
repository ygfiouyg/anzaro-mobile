import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

// Phase 8.1: change the visual theme preset (linked to personality)
export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { themePreset?: string; dialect?: string }
    const data: Record<string, string> = {}
    if (body.themePreset) data.themePreset = body.themePreset
    if (body.dialect) data.dialect = body.dialect
    const updated = await db.user.update({ where: { id: user.id }, data })
    return NextResponse.json({ user: updated })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
