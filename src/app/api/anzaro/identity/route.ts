import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { HERO_JOURNEY_QUESTIONS } from '@/lib/hero-journey-questions'
import { compileIdentityMatrix, generateSensoryProfile, type IdentityMatrix } from '@/lib/identity-matrix-engine'

// GET — returns the 20 Hero's Journey questions
export async function GET(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    return NextResponse.json({
      questions: HERO_JOURNEY_QUESTIONS,
      total: HERO_JOURNEY_QUESTIONS.length,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST — compiles answers into Identity Matrix + saves to DB
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    const body = (await req.json()) as {
      answers: Record<string, number[]>          // questionId → selected option scores array
      conflictResolutions?: Record<string, string>
    }

    if (!body.answers || Object.keys(body.answers).length < 15) {
      return NextResponse.json({ error: 'At least 15 answers required' }, { status: 400 })
    }

    // Compile the Identity Matrix
    const matrix = await compileIdentityMatrix(body.answers, body.conflictResolutions || {})

    // Generate Smart Ball sensory profile
    const sensory = generateSensoryProfile(matrix)

    // Save to database — upsert the PersonalityProfile
    const { db } = await import('@/lib/db')
    const profile = await db.personalityProfile.upsert({
      where: { userId: user.id },
      update: {
        markdown: matrix.markdown,
        name: user.name || 'Unknown',
        personaType: matrix.primaryArchetype,
        dialect: 'egyptian',
        leadership: matrix.traits.leadership || 50,
        stubbornness: matrix.traits.machiavellianism || 50,
        analytical: matrix.traits.analyticalDepth || 50,
        emotional: matrix.traits.emotionalIntelligence || 50,
        sociability: matrix.traits.emotionalIntelligence || 50,
        discipline: matrix.traits.discipline || 50,
        humor: 50,
        driversJson: JSON.stringify(matrix.archetypes),
        preferencesJson: JSON.stringify({ cognitiveStyle: matrix.cognitiveStyle, growthFriction: matrix.growthFrictionLevel }),
        triggersJson: JSON.stringify({ darkTriad: matrix.darkTriad, sensoryProfile: sensory }),
        version: { increment: 1 },
        lastEvolvedAt: new Date(),
      },
      create: {
        userId: user.id,
        markdown: matrix.markdown,
        name: user.name || 'Unknown',
        personaType: matrix.primaryArchetype,
        dialect: 'egyptian',
        leadership: matrix.traits.leadership || 50,
        stubbornness: matrix.traits.machiavellianism || 50,
        analytical: matrix.traits.analyticalDepth || 50,
        emotional: matrix.traits.emotionalIntelligence || 50,
        sociability: matrix.traits.emotionalIntelligence || 50,
        discipline: matrix.traits.discipline || 50,
        humor: 50,
        driversJson: JSON.stringify(matrix.archetypes),
        preferencesJson: JSON.stringify({ cognitiveStyle: matrix.cognitiveStyle, growthFriction: matrix.growthFrictionLevel }),
        triggersJson: JSON.stringify({ darkTriad: matrix.darkTriad, sensoryProfile: sensory }),
      },
    })

    return NextResponse.json({
      matrix,
      sensory,
      profile,
      systemPersona: matrix.systemPersona,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
