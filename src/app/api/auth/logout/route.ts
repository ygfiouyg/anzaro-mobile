import { NextResponse } from 'next/server'
import { clearSessionCookie, getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST() {
  try {
    const user = await getSessionUser()
    if (user) {
      await db.session.deleteMany({ where: { userId: user.id } }).catch(() => {})
    }
    await clearSessionCookie()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
