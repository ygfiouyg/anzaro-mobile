import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { complete } from '@/lib/llm'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const routines = await db.routine.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: { confidence: 'desc' },
    })
    return NextResponse.json({ routines })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Phase 6.3: AI suggests a contextual routine based on personality + observed usage
export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { prompt?: string }

    const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } })
    const quickActions = await db.quickAction.findMany({
      where: { userId: user.id },
      orderBy: { useCount: 'desc' },
      take: 5,
    })

    const suggestionText = await complete(
      [
        {
          role: 'system',
          content:
            'You are Anzaro\'s routine advisor. Given the user personality and their most-used actions, propose ONE smart automation routine in JSON: {name, nameAr, description, trigger:{type:"schedule"|pattern, ...}, actions:[{entityId|alias, action, params}], confidence:0-100}. Reply with JSON only.',
        },
        {
          role: 'user',
          content: `Persona: ${profile?.personaType ?? 'balanced'}\nDrivers: ${profile?.driversJson ?? '[]'}\nMost used actions: ${JSON.stringify(quickActions.map((a) => ({ label: a.label, count: a.useCount })))}\nUser hint: ${body?.prompt ?? 'suggest something useful'}`,
        },
      ],
      { temperature: 0.7, maxTokens: 500 }
    )

    let parsed: any = {}
    try {
      parsed = JSON.parse(suggestionText.replace(/```json/gi, '').replace(/```/g, '').trim())
    } catch {}

    const routine = await db.routine.create({
      data: {
        userId: user.id,
        name: parsed.name ?? 'Smart Routine',
        nameAr: parsed.nameAr ?? 'روتين ذكي',
        description: parsed.description ?? 'AI-suggested routine',
        triggerJson: JSON.stringify(parsed.trigger ?? { type: 'pattern' }),
        actionsJson: JSON.stringify(parsed.actions ?? []),
        learnedFrom: 'ai_suggested',
        confidence: parsed.confidence ?? 60,
      },
    })
    return NextResponse.json({ routine })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
