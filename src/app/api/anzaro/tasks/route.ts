import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { complete } from '@/lib/anzaro-llm'

// Phase 7.2: Proactive Automation Triggers — Google Tasks sync stub.
// Returns AI-suggested tasks based on the user's personality profile.
export async function GET(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    const { db } = await import('@/lib/db')
    const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } })

    const tasksText = await complete([
      { role: 'system', content: 'You are Anzaro\'s proactive task advisor. Based on the user personality, suggest 3 actionable tasks for today in JSON: [{title, titleAr, priority, estimatedMinutes, category}]. Reply JSON only.' },
      { role: 'user', content: `Persona: ${profile?.personaType || 'balanced'}, discipline: ${profile?.discipline || 50}, drivers: ${profile?.driversJson || '[]'}. Generate 3 tasks.` },
    ], { temperature: 0.7, maxTokens: 400 })

    let tasks: any[] = []
    try {
      tasks = JSON.parse(tasksText.replace(/```json/gi, '').replace(/```/g, '').trim())
    } catch {
      tasks = [
        { title: 'Review daily goals', titleAr: 'راجع أهدافك اليومية', priority: 'high', estimatedMinutes: 15, category: 'planning' },
        { title: 'Focus session', titleAr: 'جلسة تركيز عميقة', priority: 'medium', estimatedMinutes: 90, category: 'work' },
        { title: 'Evening wind-down', titleAr: 'استرخاء المساء', priority: 'low', estimatedMinutes: 20, category: 'wellness' },
      ]
    }

    return NextResponse.json({ tasks, persona: profile?.personaType || 'balanced' })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
