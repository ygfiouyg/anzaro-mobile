import { NextRequest, NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!
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
