import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { resolveDeviceByAlias, executeDeviceAction } from '@/lib/anzaro-control-engine'

// Phase 2/6: control a device by natural-language alias (the semantic dictionary)
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!
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
