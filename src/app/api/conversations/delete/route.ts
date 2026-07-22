import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = (await req.json()) as { id: string }
    const conv = await db.conversation.findUnique({ where: { id } })
    if (!conv || conv.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.conversation.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
