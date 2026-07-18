import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { executeScene, executeSceneByName } from '@/lib/anzaro-control-engine'

export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!
    const body = (await req.json()) as { sceneId?: string; name?: string }
    if (body.sceneId) {
      const r = await executeScene(body.sceneId)
      return NextResponse.json(r)
    }
    if (body.name) {
      const r = await executeSceneByName(body.name)
      return NextResponse.json(r)
    }
    return NextResponse.json({ ok: false, error: 'sceneId or name required' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
