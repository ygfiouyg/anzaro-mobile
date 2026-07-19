import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { fetchHassEntities, toggleHassEntity, setHassState, getHassConfig, getMatrixEnvironmentSuggestions } from '@/lib/hass-client'

// GET — fetch all HASS entities + config status
export async function GET(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    const config = getHassConfig()
    const entities = await fetchHassEntities()

    return NextResponse.json({
      entities,
      config: {
        isConfigured: config.isConfigured,
        url: config.url ? config.url.replace(/\/$/, '') : null,
        // Never expose the token to the client
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST — toggle/set entity state + get matrix-based suggestions
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    const body = (await req.json()) as {
      action: 'toggle' | 'turn_on' | 'turn_off' | 'set_state' | 'get_suggestions'
      entityId?: string
      service?: string
      serviceData?: Record<string, unknown>
      matrix?: any
    }

    // V.14: Get matrix-based environment suggestions
    if (body.action === 'get_suggestions' && body.matrix) {
      const suggestions = getMatrixEnvironmentSuggestions(body.matrix)
      return NextResponse.json({ suggestions })
    }

    if (!body.entityId) {
      return NextResponse.json({ error: 'entityId required' }, { status: 400 })
    }

    if (body.action === 'set_state') {
      if (!body.service) {
        return NextResponse.json({ error: 'service required for set_state' }, { status: 400 })
      }
      const result = await setHassState(body.entityId, body.service, body.serviceData || {})
      return NextResponse.json(result)
    }

    const result = await toggleHassEntity(body.entityId, body.action as 'turn_on' | 'turn_off' | 'toggle')
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
