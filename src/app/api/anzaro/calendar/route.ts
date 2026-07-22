import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { complete } from '@/lib/anzaro-llm'

// Phase 7.2: Proactive Automation Triggers — Google Calendar sync stub.
// In production, this would use the Google Calendar API with the user's OAuth token.
// For now, it returns AI-generated contextual reminders based on the user's personality + time of day.
export async function GET(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    const { db } = await import('@/lib/db')
    const profile = await db.personalityProfile.findUnique({ where: { userId: user.id } })
    const hour = new Date().getHours()
    const phase = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'

    // Generate contextual "calendar events" based on personality + time
    const eventsText = await complete([
      { role: 'system', content: 'You are Anzaro\'s proactive scheduler. Based on the user personality and current time, suggest 3 realistic calendar events/reminders for today in JSON: [{title, titleAr, time, priority, type}]. Reply JSON only.' },
      { role: 'user', content: `Persona: ${profile?.personaType || 'balanced'}, discipline: ${profile?.discipline || 50}. Time phase: ${phase}. Dialect: ${profile?.dialect || 'egyptian'}. Generate 3 events.` },
    ], { temperature: 0.7, maxTokens: 400 })

    let events: any[] = []
    try {
      events = JSON.parse(eventsText.replace(/```json/gi, '').replace(/```/g, '').trim())
    } catch {
      events = [
        { title: 'Morning routine', titleAr: 'روتين الصباح', time: '08:00', priority: 'medium', type: 'routine' },
        { title: 'Deep work session', titleAr: 'جلسة شغل مركز', time: '14:00', priority: 'high', type: 'focus' },
        { title: 'Evening reflection', titleAr: 'تأمل المساء', time: '20:00', priority: 'low', type: 'wellness' },
      ]
    }

    return NextResponse.json({ events, phase, persona: profile?.personaType || 'balanced' })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
