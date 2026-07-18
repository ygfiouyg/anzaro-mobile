import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await db.mediaSession.findFirst({
      where: { userId: user.id, status: { in: ['playing', 'paused'] } },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    })
    return NextResponse.json({ session })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
