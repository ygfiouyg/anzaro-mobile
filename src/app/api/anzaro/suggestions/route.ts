import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'
import { complete } from '@/lib/anzaro-llm'

// AI-generated quick-action suggestions based on the user's personality + usage history.
// Returns 3-5 suggested commands the user might want to run.
export async function GET(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    const { db } = await import('@/lib/db')

    // Get the user's personality profile + most-used quick actions + recent chat messages
    const [profile, quickActions, recentMessages] = await Promise.all([
      db.personalityProfile.findUnique({ where: { userId: user.id } }),
      db.quickAction.findMany({
        where: { userId: user.id },
        orderBy: { useCount: 'desc' },
        take: 5,
      }),
      db.message.findMany({
        where: { userId: user.id, role: 'user' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { content: true },
      }),
    ])

    const hour = new Date().getHours()
    const phase = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'

    const suggestionText = await complete([
      {
        role: 'system',
        content: `You are Anzaro's proactive suggestion engine. Based on the user's personality, usage history, recent messages, and current time, generate 3-5 quick-action suggestions in JSON format.

Each suggestion should be:
{ "label": "short Arabic label (max 25 chars)", "command": "natural language command", "icon": "lucide icon name", "category": "media|device|scene|chat" }

Consider:
- Time of day (morning → focus/work, evening → relax/cinema, night → sleep)
- Personality type (leader → efficiency, creative → inspiration, emotional → comfort)
- Past usage patterns
- Available devices (light, TV, AC, curtains, fan, softbox, DND)
- Available scenes (focus, cinema, sleep, business, recording)
- Available media (Quran radio, music, news)

Reply with JSON array only, no markdown fences.`,
      },
      {
        role: 'user',
        content: `Persona: ${profile?.personaType || 'balanced'}
Discipline: ${profile?.discipline || 50}
Dialect: ${profile?.dialect || 'egyptian'}
Time phase: ${phase}
Most used actions: ${JSON.stringify(quickActions.map((a) => ({ label: a.label, count: a.useCount })))}
Recent messages: ${JSON.stringify(recentMessages.map((m) => m.content.slice(0, 50)))}
Generate 4 suggestions.`,
      },
    ], { temperature: 0.8, maxTokens: 600 })

    let suggestions: any[] = []
    try {
      const cleaned = suggestionText.replace(/```json/gi, '').replace(/```/g, '').trim()
      suggestions = JSON.parse(cleaned)
      if (!Array.isArray(suggestions)) suggestions = []
    } catch {
      // Fallback suggestions based on time of day
      suggestions = getDefaultSuggestions(phase)
    }

    // Ensure we have at least 3 suggestions
    if (suggestions.length < 3) {
      const defaults = getDefaultSuggestions(phase)
      suggestions = [...suggestions, ...defaults].slice(0, 5)
    }

    return NextResponse.json({
      suggestions,
      phase,
      persona: profile?.personaType || 'balanced',
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function getDefaultSuggestions(phase: string): any[] {
  if (phase === 'morning') {
    return [
      { label: 'شغّل قرآن الصباح', command: 'شغّل قرآن', icon: 'Radio', category: 'media' },
      { label: 'وضع التركيز', command: 'نفّس وضع التركيز', icon: 'Brain', category: 'scene' },
      { label: 'ولّع نور المكتب', command: 'ولّع نور المكتب', icon: 'Lightbulb', category: 'device' },
    ]
  } else if (phase === 'evening') {
    return [
      { label: 'وضع السينما', command: 'نفّس وضع السينما', icon: 'Clapperboard', category: 'scene' },
      { label: 'شغّل موسيقى', command: 'شغّل موسيقى', icon: 'Radio', category: 'media' },
      { label: 'اقفل النور', command: 'اقفل النور', icon: 'Lightbulb', category: 'device' },
    ]
  } else if (phase === 'night') {
    return [
      { label: 'وضع النوم', command: 'نفّس وضع النوم', icon: 'Moon', category: 'scene' },
      { label: 'اقفل كل حاجة', command: 'اقفل كل الأجهزة', icon: 'Zap', category: 'device' },
      { label: 'شغّل قرآن قبل النوم', command: 'شغّل قرآن', icon: 'Radio', category: 'media' },
    ]
  }
  return [
    { label: 'شغّل قرآن', command: 'شغّل قرآن', icon: 'Radio', category: 'media' },
    { label: 'وضع التركيز', command: 'نفّس وضع التركيز', icon: 'Brain', category: 'scene' },
    { label: 'إيه أخبارك؟', command: 'إيه أخبارك يا آنزارو؟', icon: 'Sparkles', category: 'chat' },
  ]
}
