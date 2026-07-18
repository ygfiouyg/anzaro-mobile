import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { detectIntent, chatWithPersonality, buildPersonalitySystemPrompt } from '@/lib/llm'
import { executeIntent } from '@/lib/control-engine'
import type { PersonalityTraits } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as { message: string; conversationId?: string }
    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    // 1. Load (or create) conversation
    let conversation = body.conversationId
      ? await db.conversation.findUnique({ where: { id: body.conversationId } })
      : null
    if (!conversation) {
      conversation = await db.conversation.create({
        data: { userId: user.id, title: body.message.slice(0, 40) },
      })
    }

    // 2. Save user message
    await db.message.create({
      data: { conversationId: conversation.id, userId: user.id, role: 'user', content: body.message },
    })

    // 3. Load personality profile (Phase 3.3 adaptive mirroring)
    const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } })

    // 4. Detect intent (Phase 2 reversed control)
    const intent = await detectIntent(body.message)

    // 5. Execute intent → produce action context
    const { context, actions } = await executeIntent(user.id, intent)

    // 6. Build personality-adapted system prompt
    let systemPrompt: string
    if (profile) {
      const traits: PersonalityTraits = {
        leadership: profile.leadership,
        stubbornness: profile.stubbornness,
        analytical: profile.analytical,
        emotional: profile.emotional,
        sociability: profile.sociability,
        discipline: profile.discipline,
        humor: profile.humor,
      }
      systemPrompt = buildPersonalitySystemPrompt({
        name: profile.name,
        personaType: profile.personaType,
        dialect: profile.dialect,
        traits,
        drivers: safeParse(profile.driversJson),
        preferences: safeParse(profile.preferencesJson),
        triggers: safeParse(profile.triggersJson),
        markdown: profile.markdown,
        activeContext: context || undefined,
      })
    } else {
      systemPrompt = `You are Anzaro, the AI inside the Smart Ball. Respond warmly and concisely. The user has not completed onboarding yet — gently invite them to build their personality profile in Settings.${context ? `\n# ACTIVE CONTEXT\n${context}` : ''}`
    }

    // 7. Load recent history
    const history = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true, createdAt: true },
    })
    history.reverse()
    const chatHistory = history.slice(0, -1).map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }))

    // 8. Generate response
    let reply = await chatWithPersonality({
      system: systemPrompt,
      history: chatHistory,
      userMessage: body.message,
    })

    if (!reply) {
      reply = context
        ? 'تمام، اتعمل. 🎯'
        : 'حصل خطأ بسيط في الاتصال، جرّب تاني.'
    }

    // 9. Save assistant message with intent + actions
    const assistantMsg = await db.message.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: 'assistant',
        content: reply,
        intent: intent.type,
        toolCallsJson: JSON.stringify(actions),
      },
    })

    // 10. Increment interaction count (Phase 7.1)
    if (profile) {
      await db.personalityProfile.update({
        where: { userId: user.id },
        data: { interactionCount: { increment: 1 } },
      })
    }

    // 11. Track quick action usage (Phase 7.6) when a device/scene/media action ran
    if (actions.length > 0) {
      const last = actions[0]
      await trackQuickAction(user.id, body.message, last).catch(() => {})
    }

    return NextResponse.json({
      reply,
      conversationId: conversation.id,
      intent,
      actions,
      messageId: assistantMsg.id,
    })
  } catch (e) {
    console.error('[chat] error', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function safeParse(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

async function trackQuickAction(userId: string, command: string, action: any) {
  const label = command.slice(0, 30)
  const actionType =
    action.kind === 'media_play' || action.kind?.startsWith('media')
      ? 'media'
      : action.kind === 'scene_execute'
        ? 'scene'
        : action.kind === 'device_control'
          ? 'device'
          : 'natural'
  // Upsert by label+user
  const existing = await db.quickAction.findFirst({ where: { userId, label: command } })
  if (existing) {
    await db.quickAction.update({ where: { id: existing.id }, data: { useCount: { increment: 1 } } })
  } else {
    await db.quickAction.create({
      data: { userId, label, labelAr: command, command, actionType, useCount: 1, isPinned: false },
    })
  }
}
