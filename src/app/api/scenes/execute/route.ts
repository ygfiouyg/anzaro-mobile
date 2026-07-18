import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { executeScene, executeSceneByName } from '@/lib/control-engine'

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
