import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { db } from '@/lib/db'

// List all conversations for the user (with last message preview)
export async function GET() {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!

    const conversations = await db.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    })

    const result = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
      lastMessage: c.messages[0]?.content?.slice(0, 80) || '',
      lastRole: c.messages[0]?.role || null,
    }))

    return NextResponse.json({ conversations: result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Create a new conversation
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!
    const body = (await req.json()) as { title?: string }
    const conv = await db.conversation.create({
      data: { userId: user.id, title: body.title || 'محادثة جديدة' },
    })
    return NextResponse.json({ conversation: conv })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
