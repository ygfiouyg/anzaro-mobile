import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { db } from '@/lib/db'
import { startMediaSession, controlMediaSession } from '@/lib/anzaro-control-engine'

// Phase 2: Reversed Command Control — direct media authority.
// The chatbot AND direct UI both hit this endpoint.
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!

    const body = (await req.json()) as {
      action: 'play' | 'pause' | 'resume' | 'stop' | 'next' | 'previous' | 'volume'
      stationId?: string
      volume?: number
    }

    if (body.action === 'play') {
      if (!body.stationId) return NextResponse.json({ error: 'stationId required for play' }, { status: 400 })
      const station = await db.radioStation.findUnique({ where: { id: body.stationId } })
      if (!station) return NextResponse.json({ error: 'station not found' }, { status: 404 })
      const session = await startMediaSession({
        userId: user.id,
        title: station.nameAr,
        source: station.name,
        streamUrl: station.streamUrl,
        stationId: station.id,
        type: 'radio',
      })
      return NextResponse.json({ ok: true, session, station })
    }

    if (body.action === 'volume') {
      const r = await controlMediaSession(user.id, 'volume', body.volume)
      return NextResponse.json(r)
    }

    const r = await controlMediaSession(user.id, body.action)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
