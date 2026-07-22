import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { resolveDeviceByAlias, executeDeviceAction } from '@/lib/control-engine'

// Phase 2/6: control a device by natural-language alias (the semantic dictionary)
export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { alias: string; action: 'turn_on' | 'turn_off' | 'toggle' | 'set_state'; params?: Record<string, unknown> }
    const deviceId = await resolveDeviceByAlias(body.alias)
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: `No device matches alias "${body.alias}"`, alias: body.alias }, { status: 404 })
    }
    const r = await executeDeviceAction(deviceId, body.action, body.params)
    return NextResponse.json({ ...r, alias: body.alias })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
