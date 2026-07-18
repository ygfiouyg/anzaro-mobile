import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeedData } from '@/lib/seed'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  await ensureSeedData()
  const devices = await db.device.findMany({ orderBy: { room: 'asc' } })
  const grouped: Record<string, typeof devices> = {}
  for (const d of devices) {
    grouped[d.room] = grouped[d.room] ? [...grouped[d.room], d] : [d]
  }
  return NextResponse.json({ devices, grouped })
}

// Phase 6.1: add a semantic alias to a device
export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { deviceId: string; alias: string; lang?: 'ar' | 'en' }
    const device = await db.device.findUnique({ where: { id: body.deviceId } })
    if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 })
    let aliases: { alias: string; lang: string }[] = []
    try {
      aliases = JSON.parse(device.aliasesJson || '[]')
    } catch {}
    if (!aliases.some((a) => a.alias.toLowerCase() === body.alias.toLowerCase())) {
      aliases.push({ alias: body.alias, lang: body.lang ?? 'ar' })
    }
    const updated = await db.device.update({
      where: { id: device.id },
      data: { aliasesJson: JSON.stringify(aliases), updatedAt: new Date() },
    })
    return NextResponse.json({ device: updated })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Toggle/control a device directly
export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { deviceId: string; action: string; params?: Record<string, unknown> }
    const { executeDeviceAction } = await import('@/lib/control-engine')
    const r = await executeDeviceAction(body.deviceId, body.action, body.params)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
