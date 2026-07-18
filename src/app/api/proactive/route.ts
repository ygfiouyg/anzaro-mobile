import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { complete } from '@/lib/llm'

// Phase 7.2: proactive triggers — generate a brotherly nudge based on profile + time
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // fetch pending nudges
    const pending = await db.proactiveNudge.findMany({
      where: { userId: user.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // generate a fresh contextual nudge based on personality + hour
    const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } })
    const hour = new Date().getHours()
    const phase =
      hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'

    let nudge: { message: string; messageAr: string; severity: string; triggerType: string } | null = null
    if (profile) {
      const raw = await complete(
        [
          {
            role: 'system',
            content:
              'You are Anzaro, a trusted older sibling. Generate ONE short, warm, proactive nudge in Egyptian Arabic for this user right now. Reply JSON: {message, messageAr, severity:"gentle"|"info", triggerType:"suggestion"}. Keep messageAr under 25 words. No quotes around JSON.',
          },
          {
            role: 'user',
            content: `Persona: ${profile.personaType}, discipline: ${profile.discipline}, drivers: ${profile.driversJson}. Time phase: ${phase}. Suggest a small helpful action or reflection.`,
          },
        ],
        { temperature: 0.8, maxTokens: 200 }
      )
      try {
        nudge = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim())
      } catch {
        nudge = {
          message: 'Ready when you are.',
          messageAr: 'أنا معاك لما تحب تبدأ. 🌙',
          severity: 'gentle',
          triggerType: 'suggestion',
        }
      }
    }

    return NextResponse.json({ pending, fresh: nudge })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
