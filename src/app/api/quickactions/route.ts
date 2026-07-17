import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actions = await db.quickAction.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: [{ isPinned: 'desc' }, { useCount: 'desc' }],
    })
    return NextResponse.json({ actions })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { label: string; command: string; actionType?: string; icon?: string }
    const action = await db.quickAction.create({
      data: {
        userId: user.id,
        label: body.label,
        command: body.command,
        actionType: body.actionType ?? 'natural',
        icon: body.icon ?? 'Zap',
        isPinned: true,
      },
    })
    return NextResponse.json({ action })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// increment use count when fired
export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { id: string }
    const action = await db.quickAction.update({
      where: { id: body.id },
      data: { useCount: { increment: 1 }, updatedAt: new Date() },
    })
    return NextResponse.json({ action })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
