import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!
    const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } })
    return NextResponse.json({ profile, user })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Phase 7.1: Adaptive Memory Refresh — increment interaction count + evolve
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!

    const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } })
    if (!profile) return NextResponse.json({ error: 'No profile yet' }, { status: 404 })

    const newCount = profile.interactionCount + 1
    await db.personalityProfile.update({
      where: { userId: user.id },
      data: { interactionCount: newCount },
    })

    // Evolve every 50 interactions (Phase 7.1)
    if (newCount % 50 === 0) {
      const recent = await db.message.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { content: true },
      })
      const { evolvePersonalityMarkdown } = await import('@/lib/llm')
      const result = await evolvePersonalityMarkdown({
        currentMarkdown: profile.markdown,
        recentMessages: recent.map((m) => m.content),
        currentTraits: {
          leadership: profile.leadership,
          stubbornness: profile.stubbornness,
          analytical: profile.analytical,
          emotional: profile.emotional,
          sociability: profile.sociability,
          discipline: profile.discipline,
          humor: profile.humor,
        },
      })

      const traits = {
        leadership: clamp(profile.leadership + (result.traitsDelta.leadership ?? 0)),
        stubbornness: clamp(profile.stubbornness + (result.traitsDelta.stubbornness ?? 0)),
        analytical: clamp(profile.analytical + (result.traitsDelta.analytical ?? 0)),
        emotional: clamp(profile.emotional + (result.traitsDelta.emotional ?? 0)),
        sociability: clamp(profile.sociability + (result.traitsDelta.sociability ?? 0)),
        discipline: clamp(profile.discipline + (result.traitsDelta.discipline ?? 0)),
        humor: clamp(profile.humor + (result.traitsDelta.humor ?? 0)),
      }

      const updated = await db.personalityProfile.update({
        where: { userId: user.id },
        data: {
          markdown: result.markdown,
          ...traits,
          version: { increment: 1 },
          lastEvolvedAt: new Date(),
        },
      })
      return NextResponse.json({ evolved: true, profile: updated, notes: result.notes, interactionCount: newCount })
    }

    return NextResponse.json({ evolved: false, interactionCount: newCount })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)))
}
