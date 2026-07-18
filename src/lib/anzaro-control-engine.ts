import { db } from '@/lib/db'
import type { ChatIntent, DeviceAction } from './anzaro-types'

// ───────────── Semantic alias resolution (Phase 6.1) ─────────────
// Maps natural-language device words ("شاشة", "tv", "screen") to entity ids.
export async function resolveDeviceByAlias(alias: string): Promise<string | null> {
  if (!alias) return null
  const devices = await db.device.findMany({ select: { id: true, entityId: true, friendlyName: true, aliasesJson: true } })
  const norm = alias.trim().toLowerCase()
  for (const d of devices) {
    if (d.entityId.toLowerCase() === norm || d.friendlyName.toLowerCase() === norm) return d.id
    let aliases: { alias: string; lang: string }[] = []
    try {
      aliases = JSON.parse(d.aliasesJson || '[]')
    } catch {
      aliases = []
    }
    if (aliases.some((a) => a.alias.toLowerCase() === norm)) return d.id
  }
  // fuzzy: partial match on friendly name
  const fuzzy = devices.find((d) => d.friendlyName.toLowerCase().includes(norm) || d.entityId.toLowerCase().includes(norm))
  return fuzzy?.id ?? null
}

// ───────────── Device control ─────────────
export async function executeDeviceAction(deviceId: string, action: string, params?: Record<string, unknown>) {
  const device = await db.device.findUnique({ where: { id: deviceId } })
  if (!device) return { ok: false, error: 'Device not found' }

  let newState = device.state
  let newAttrs: Record<string, unknown> = {}
  try {
    newAttrs = JSON.parse(device.attributesJson || '{}')
  } catch {}

  if (action === 'turn_on') newState = 'on'
  else if (action === 'turn_off') newState = 'off'
  else if (action === 'toggle') newState = device.state === 'on' ? 'off' : 'on'
  else if (action === 'set_state') {
    if (params?.state) newState = String(params.state)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (k !== 'state') newAttrs[k] = v
      }
    }
    if (params?.brightness !== undefined) newState = Number(params.brightness) > 0 ? 'on' : 'off'
  }

  const updated = await db.device.update({
    where: { id: deviceId },
    data: { state: newState, attributesJson: JSON.stringify(newAttrs), updatedAt: new Date() },
  })
  return { ok: true, device: updated }
}

// ───────────── Scene execution (Phase 7.5 mood scenes) ─────────────
export async function executeScene(sceneId: string): Promise<{ ok: boolean; results: any[]; scene?: any }> {
  const scene = await db.moodScene.findUnique({ where: { id: sceneId } })
  if (!scene) return { ok: false, results: [] }
  let actions: DeviceAction[] = []
  try {
    actions = JSON.parse(scene.actionsJson || '[]')
  } catch {}
  const results: any[] = []
  for (const a of actions) {
    // find device by entityId
    const device = await db.device.findUnique({ where: { entityId: a.entityId } })
    if (!device) {
      results.push({ entityId: a.entityId, ok: false, error: 'not found' })
      continue
    }
    const r = await executeDeviceAction(device.id, a.action, a.params)
    results.push({ entityId: a.entityId, ...r })
  }
  return { ok: true, results, scene }
}

export async function executeSceneByName(name: string): Promise<{ ok: boolean; results: any[]; scene?: any }> {
  const norm = name.trim().toLowerCase()
  const scenes = await db.moodScene.findMany()
  const scene =
    scenes.find((s) => s.name.toLowerCase() === norm || s.nameAr === name) ??
    scenes.find((s) => s.triggerPhrase.toLowerCase() === norm) ??
    scenes.find((s) => s.name.toLowerCase().includes(norm) || s.nameAr.includes(name))
  if (!scene) return { ok: false, results: [] }
  return executeScene(scene.id)
}

// ───────────── Media session (Phase 2 reversed control) ─────────────
export async function startMediaSession(opts: {
  userId: string
  type?: string
  title: string
  source: string
  streamUrl?: string
  stationId?: string
}): Promise<any> {
  // Stop any existing session first
  await db.mediaSession.updateMany({
    where: { userId: opts.userId, status: { in: ['playing', 'paused'] } },
    data: { status: 'stopped' },
  })
  const session = await db.mediaSession.create({
    data: {
      userId: opts.userId,
      type: opts.type ?? 'radio',
      title: opts.title,
      source: opts.source,
      streamUrl: opts.streamUrl,
      stationId: opts.stationId,
      status: 'playing',
      volume: 70,
      startedAt: new Date(),
    },
  })
  return session
}

export async function controlMediaSession(userId: string, action: string, volume?: number): Promise<any> {
  const active = await db.mediaSession.findFirst({
    where: { userId, status: { in: ['playing', 'paused'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (!active) {
    return { ok: false, error: 'no_active_session' }
  }
  if (action === 'stop') {
    const updated = await db.mediaSession.update({ where: { id: active.id }, data: { status: 'stopped', startedAt: null } })
    return { ok: true, session: updated, action: 'stopped' }
  }
  if (action === 'pause') {
    const updated = await db.mediaSession.update({ where: { id: active.id }, data: { status: 'paused' } })
    return { ok: true, session: updated, action: 'paused' }
  }
  if (action === 'resume') {
    const updated = await db.mediaSession.update({ where: { id: active.id }, data: { status: 'playing' } })
    return { ok: true, session: updated, action: 'resumed' }
  }
  if (action === 'volume' && typeof volume === 'number') {
    const updated = await db.mediaSession.update({ where: { id: active.id }, data: { volume } })
    return { ok: true, session: updated, action: 'volume' }
  }
  return { ok: false, error: 'unknown_action' }
}

// ───────────── Intent execution bridge (Phase 2 reversed control) ─────────────
export async function executeIntent(userId: string, intent: ChatIntent): Promise<{ context: string; actions: any[] }> {
  const actions: any[] = []
  let context = ''

  if (intent.type === 'media' && intent.media) {
    const m = intent.media
    if (m.type === 'play') {
      // search stations by query
      const stations = await db.radioStation.findMany()
      const q = (m.query || '').toLowerCase()
      const match =
        stations.find((s) => s.name.toLowerCase().includes(q) || s.nameAr.includes(m.query || '') || s.city?.toLowerCase().includes(q)) ??
        stations.find((s) => s.category === 'quran') // default to Quran if "play quran"
      if (match) {
        const session = await startMediaSession({
          userId,
          title: match.nameAr,
          source: match.name,
          streamUrl: match.streamUrl,
          stationId: match.id,
          type: 'radio',
        })
        actions.push({ kind: 'media_play', station: match.nameAr, sessionId: session.id })
        context = `Executed: started playing "${match.nameAr}" radio station (source: ${match.name}).`
      } else {
        context = 'No matching radio station found.'
      }
    } else if (['stop', 'pause', 'resume'].includes(m.type)) {
      const r = await controlMediaSession(userId, m.type)
      actions.push({ kind: 'media_' + m.type, result: r })
      context = r.ok ? `Executed: media ${m.type} command applied to active session.` : 'No active media session to control.'
    } else if (m.type === 'volume' && typeof m.volume === 'number') {
      const r = await controlMediaSession(userId, 'volume', m.volume)
      actions.push({ kind: 'media_volume', result: r })
      context = r.ok ? `Set volume to ${m.volume}%.` : 'No active media session.'
    }
  } else if (intent.type === 'device' && intent.device) {
    const alias = intent.device.alias || ''
    const deviceId = await resolveDeviceByAlias(alias)
    if (deviceId) {
      const r = await executeDeviceAction(deviceId, intent.device.action, intent.device.params)
      actions.push({ kind: 'device_control', alias, result: r })
      const dev = await db.device.findUnique({ where: { id: deviceId } })
      context = `Executed: ${intent.device.action} on ${dev?.friendlyName} (${dev?.entityId}) → state is now "${dev?.state}".`
    } else {
      context = `Could not resolve a device for "${alias}". Ask the user to define an alias in Settings.`
    }
  } else if (intent.type === 'scene' && intent.scene) {
    const name = intent.scene.name || ''
    const r = await executeSceneByName(name)
    actions.push({ kind: 'scene_execute', name, result: r })
    if (r.ok && r.scene) {
      context = `Executed mood scene "${r.scene.nameAr}" — applied ${r.results.length} device action(s).`
    } else {
      context = `No mood scene matched "${name}".`
    }
  }

  return { context, actions }
}
