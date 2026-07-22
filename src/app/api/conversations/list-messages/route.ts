import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

// Get all messages for a conversation (for loading history)
export async function GET(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const conversationId = searchParams.get('id')
    if (!conversationId) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const conv = await db.conversation.findUnique({ where: { id: conversationId } })
    if (!conv || conv.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        intent: true,
        toolCallsJson: true,
        createdAt: true,
      },
    })

    const parsed = messages.map((m) => ({
      ...m,
      actions: (() => {
        try { return JSON.parse(m.toolCallsJson || '[]') } catch { return [] }
      })(),
      toolCallsJson: undefined,
    }))

    return NextResponse.json({ conversation: conv, messages: parsed })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
