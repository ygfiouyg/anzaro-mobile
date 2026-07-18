import { NextResponse } from 'next/server'
import { ONBOARDING_QUESTIONS } from '@/lib/anzaro-onboarding'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { db } from '@/lib/db'

export async function GET() {
  return NextResponse.json({ questions: ONBOARDING_QUESTIONS, total: ONBOARDING_QUESTIONS.length })
}

// Phase 3.2: compile the answers into a user_personality.md profile
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req); if (authResp) return authResp
    if (!user) return authResp!

    const body = (await req.json()) as {
      answers: Record<string, string>
      name: string
      age?: number
      occupation?: string
      dialect?: string
    }

    if (!body.answers || !body.name) {
      return NextResponse.json({ error: 'answers and name are required' }, { status: 400 })
    }

    const { compilePersonalityMarkdown } = await import('@/lib/llm')
    const compiled = await compilePersonalityMarkdown({
      name: body.name,
      age: body.age,
      occupation: body.occupation,
      dialect: body.dialect ?? user.dialect,
      answers: body.answers,
    })

    // Persist the canonical markdown + structured fields, bound to the user account
    const profile = await db.personalityProfile.upsert({
      where: { userId: user.id },
      update: {
        markdown: compiled.markdown,
        name: body.name,
        age: body.age ?? null,
        occupation: body.occupation ?? null,
        personaType: compiled.personaType,
        dialect: body.dialect ?? user.dialect,
        leadership: compiled.traits.leadership,
        stubbornness: compiled.traits.stubbornness,
        analytical: compiled.traits.analytical,
        emotional: compiled.traits.emotional,
        sociability: compiled.traits.sociability,
        discipline: compiled.traits.discipline,
        humor: compiled.traits.humor,
        driversJson: JSON.stringify(compiled.drivers),
        preferencesJson: JSON.stringify(compiled.preferences),
        triggersJson: JSON.stringify(compiled.triggers),
        version: { increment: 1 },
        lastEvolvedAt: new Date(),
      },
      create: {
        userId: user.id,
        markdown: compiled.markdown,
        name: body.name,
        age: body.age ?? null,
        occupation: body.occupation ?? null,
        personaType: compiled.personaType,
        dialect: body.dialect ?? user.dialect,
        leadership: compiled.traits.leadership,
        stubbornness: compiled.traits.stubbornness,
        analytical: compiled.traits.analytical,
        emotional: compiled.traits.emotional,
        sociability: compiled.traits.sociability,
        discipline: compiled.traits.discipline,
        humor: compiled.traits.humor,
        driversJson: JSON.stringify(compiled.drivers),
        preferencesJson: JSON.stringify(compiled.preferences),
        triggersJson: JSON.stringify(compiled.triggers),
      },
    })

    // Update the user's dialect + theme preset based on persona
    const themePreset =
      compiled.personaType === 'leader'
        ? 'leadership'
        : compiled.personaType === 'creative'
          ? 'creative'
          : compiled.personaType === 'emotional'
            ? 'calm'
            : 'aurora'
    await db.user.update({
      where: { id: user.id },
      data: { dialect: body.dialect ?? user.dialect, themePreset, name: body.name },
    })

    return NextResponse.json({ profile, traits: compiled.traits })
  } catch (e) {
    console.error('[onboard] error', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

