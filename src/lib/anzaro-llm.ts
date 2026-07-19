import ZAI from 'z-ai-web-dev-sdk'
import type { ChatIntent, PersonalityTraits } from './anzaro-types'

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAI() {
  if (!_zai) _zai = await ZAI.create()
  return _zai
}

// ───────────────── Generic chat completion ─────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function complete(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; model?: string } = {}
): Promise<string> {
  try {
    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      model: opts.model || 'glm-4-flash',
      messages: messages as any,
      thinking: { type: 'disabled' },
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1200,
    } as any)
    return completion.choices[0]?.message?.content ?? ''
  } catch (err) {
    console.error('[LLM] complete error:', err)
    return ''
  }
}

// ───────────────── Intent detection (Phase 2 reversed control) ─────────────────

const INTENT_SYSTEM = `You are the Anzaro intent router. Analyze the user's message and decide what kind of action is needed.
Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "type": "chat" | "media" | "device" | "scene" | "mcp",
  "media": { "type": "play|pause|resume|stop|next|previous|volume", "query": "optional search", "volume": number },
  "device": { "alias": "user word for device e.g. screen/light/tv/ac/fan", "action": "turn_on|turn_off|toggle|set_state", "params": {} },
  "scene": { "name": "focus|cinema|sleep|business|recording|..." },
  "mcpTool": "tool name if user explicitly asks to use an mcp tool",
  "mcpArgs": {}
}
Only include the fields relevant to the detected type. If the user is making casual conversation or asking a question that needs a real answer, type = "chat".
Rules:
- "stop the song", "turn it off", "اقفل الراديو", "وقف الأغنية" => media stop
- "pause", " pause it", " Pause " => media pause
- "resume", "continue", "كمل" => media resume
- "play quran", "شغل قرآن من القاهرة" => media play with query
- "turn on the light", "ولع النور", "افتح الشاشة" => device control
- "focus mode", "cinema mode", "I need to focus", "نفّس وضع التركيز" => scene
Keep it concise.`

export async function detectIntent(userMessage: string): Promise<ChatIntent> {
  const raw = await complete(
    [
      { role: 'system', content: INTENT_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.1, maxTokens: 300 }
  )
  try {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return parsed as ChatIntent
  } catch {
    return { type: 'chat' }
  }
}

// ───────────────── Personality-adapted chat (Phase 3.3) ─────────────────

export function buildPersonalitySystemPrompt(opts: {
  name: string
  personaType: string
  dialect: string
  traits: PersonalityTraits
  drivers: string[]
  preferences: string[]
  triggers: string[]
  markdown: string
  activeContext?: string
}): string {
  const { name, personaType, dialect, traits, drivers, preferences, triggers, markdown, activeContext } = opts

  const dialectMap: Record<string, string> = {
    egyptian: 'Egyptian Arabic (اللهجة المصرية) — natural, warm, with Egyptian idioms',
    khaleeji: 'Khaleeji/Gulf Arabic (اللهجة الخليجية)',
    levantine: 'Levantine Arabic (اللهجة الشامية)',
    msa: 'Modern Standard Arabic (الفصحى)',
    english: 'English',
  }
  const dialectInstruction = dialectMap[dialect] ?? dialectMap.egyptian

  const toneGuide: Record<string, string> = {
    leader: 'Be precise, high-authority, efficient. Lead with the answer, then 1-2 supporting lines. No fluff. Respect their time.',
    analytical: 'Be structured. Use short bullets or numbered steps. Show the logic. Cite specifics.',
    creative: 'Be warm and imaginative. Use vivid language. Encourage exploration.',
    emotional: 'Be empathetic and grounding. Acknowledge feelings first, then guide gently. Warm, brotherly tone.',
    balanced: 'Be natural and balanced — friendly but concise.',
  }

  const traitDirectives: string[] = []
  if (traits.leadership >= 70) traitDirectives.push('Treat the user as a decision-maker; offer clear options with a recommendation.')
  if (traits.stubbornness >= 70) traitDirectives.push('Do not argue. Present facts neutrally; let them decide.')
  if (traits.analytical >= 70) traitDirectives.push('Prefer data, numbers, and structured reasoning.')
  if (traits.emotional >= 70) traitDirectives.push('Acknowledge emotional context; be supportive.')
  if (traits.discipline >= 70) traitDirectives.push('Hold the user accountable in a brotherly way; remind of goals.')
  if (traits.humor >= 70) traitDirectives.push('A light, tasteful remark is welcome — never forced.')

  return `You are Anzaro — the brain inside "The Smart Ball" and the Anzaro AI companion. You are the user's trusted older sibling (أخ أكبر). You protect their time, energy, and focus.

# USER PERSONALITY PROFILE (user_personality.md)
${markdown}

# RESPONSE RULES
- Language/dialect: respond in ${dialectInstruction}. Mirror the user's dialect exactly. If they write Egyptian, you write Egyptian. If Khaleeji, you write Khaleeji.
- Tone: ${toneGuide[personaType] ?? toneGuide.balanced}
- Address the user by name "${name}" sparingly (max once per response), as a trusted companion would.
- Personality directives:
${traitDirectives.map((d) => `  • ${d}`).join('\n')}
- Key drivers: ${drivers.join(', ') || 'n/a'}
- Preferences: ${preferences.join(', ') || 'n/a'}
- Triggers to avoid/support: ${triggers.join(', ') || 'n/a'}
- Keep responses concise by default. Expand only when the user asks for depth.
- When you executed a system action (media, device, scene), briefly confirm what you did in one short line, then add value (e.g. context or a follow-up suggestion).
- Never ask "would you like me to?" for direct imperatives — just do it; the action layer already executed it.${activeContext ? `\n# ACTIVE CONTEXT\n${activeContext}` : ''}

You are Anzaro. Speak now.`
}

export async function chatWithPersonality(opts: {
  system: string
  history: ChatMessage[]
  userMessage: string
}): Promise<string> {
  return complete(
    [
      { role: 'system', content: opts.system },
      ...opts.history.slice(-8),
      { role: 'user', content: opts.userMessage },
    ],
    { temperature: 0.75, maxTokens: 900 }
  )
}

// ───────────────── Personality compilation (Phase 3.2) ─────────────────

export interface OnboardingAnswers {
  [questionId: string]: string
}

export async function compilePersonalityMarkdown(opts: {
  name: string
  age?: number
  occupation?: string
  dialect: string
  answers: OnboardingAnswers
}): Promise<{
  markdown: string
  personaType: string
  traits: PersonalityTraits
  drivers: string[]
  preferences: string[]
  triggers: string[]
}> {
  const answersBlock = Object.entries(opts.answers)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n')

  const prompt = `You are Anzaro's psychological profiler. Below are the answers a new user gave during onboarding.
Analyze them and produce TWO things:

1. A canonical user_personality.md markdown document with these sections:
   - # User Profile
   - ## Identity (name, age, occupation, dialect)
   - ## Persona Type (one of: leader, analytical, creative, emotional, balanced — with a one-line justification)
   - ## Psychological Traits (table of: Leadership, Stubbornness, Analytical, Emotional, Sociability, Discipline, Humor — each 0-100 with a short note)
   - ## Core Drivers (bullet list of what truly motivates them)
   - ## Preferences (bullet list)
   - ## Triggers / Boundaries (things to respect or avoid)
   - ## Recommended Interaction Style (how Anzaro should speak with them)

2. A JSON object (on a final line, no fences) with: personaType, traits{leadership,stubbornness,analytical,emotional,sociability,discipline,humor}, drivers[], preferences[], triggers[]

USER INPUTS:
Name: ${opts.name}
Age: ${opts.age ?? 'unknown'}
Occupation: ${opts.occupation ?? 'unknown'}
Dialect: ${opts.dialect}

Answers:
${answersBlock}

Output the markdown first, then a single line "###JSON###" then the JSON object.`

  const raw = await complete(
    [
      { role: 'system', content: 'You are a world-class behavioral psychologist and personality analyst.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.6, maxTokens: 1600 }
  )

  const [mdPart, jsonPart] = raw.split('###JSON###')
  const markdown = (mdPart || raw).trim()

  let parsed: any = {}
  try {
    parsed = JSON.parse((jsonPart || '{}').replace(/```json/gi, '').replace(/```/g, '').trim())
  } catch {
    // fall back to neutral defaults
  }

  const traits: PersonalityTraits = {
    leadership: clamp(parsed.traits?.leadership ?? 50),
    stubbornness: clamp(parsed.traits?.stubbornness ?? 50),
    analytical: clamp(parsed.traits?.analytical ?? 50),
    emotional: clamp(parsed.traits?.emotional ?? 50),
    sociability: clamp(parsed.traits?.sociability ?? 50),
    discipline: clamp(parsed.traits?.discipline ?? 50),
    humor: clamp(parsed.traits?.humor ?? 50),
  }

  return {
    markdown,
    personaType: parsed.personaType ?? 'balanced',
    traits,
    drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
    preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
    triggers: Array.isArray(parsed.triggers) ? parsed.triggers : [],
  }
}

function clamp(n: unknown): number {
  const v = Number(n)
  if (isNaN(v)) return 50
  return Math.max(0, Math.min(100, Math.round(v)))
}

// ───────────────── Personality evolution (Phase 7.1) ─────────────────

export async function evolvePersonalityMarkdown(opts: {
  currentMarkdown: string
  recentMessages: string[]
  currentTraits: PersonalityTraits
}): Promise<{
  markdown: string
  traitsDelta: Partial<PersonalityTraits>
  notes: string[]
}> {
  const recent = opts.recentMessages.slice(-20).join('\n')
  const prompt = `You are Anzaro's adaptive memory engine. Analyze the user's recent interactions and detect subtle shifts in personality, interests, or emotional state.
Update the profile markdown accordingly — keep the same section structure, but refine the trait scores and drivers based on observed behavior.

CURRENT PROFILE:
${opts.currentMarkdown}

RECENT INTERACTIONS:
${recent}

CURRENT TRAITS: ${JSON.stringify(opts.currentTraits)}

Output the FULL updated markdown, then a line "###DELTA###" then JSON: { "traitsDelta": {trait: number delta}, "notes": ["short note", ...] }`

  const raw = await complete(
    [
      { role: 'system', content: 'You are a precise behavioral analyst.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.5, maxTokens: 1600 }
  )
  const [mdPart, deltaPart] = raw.split('###DELTA###')
  let parsed: any = {}
  try {
    parsed = JSON.parse((deltaPart || '{}').replace(/```json/gi, '').replace(/```/g, '').trim())
  } catch {}
  return {
    markdown: (mdPart || raw).trim(),
    traitsDelta: parsed.traitsDelta ?? {},
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
  }
}

// ───────────────── Onboarding next question (adaptive) ─────────────────

export async function pickNextOnboardingQuestion(opts: {
  answered: string[]
  personaHints: string
}): Promise<string> {
  // Lightweight: returns a suggested question text. The static bank is primary;
  // this is used to enrich with one adaptive question.
  const prompt = `Suggest ONE adaptive psychological profiling question (in Arabic) that has NOT been asked yet.
Already asked: ${opts.answered.join(', ') || 'none'}
Hints so far: ${opts.personaHints}
Return only the question text, no quotes, no extra text.`
  const q = await complete(
    [
      { role: 'system', content: 'You are a warm psychological interviewer.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.8, maxTokens: 120 }
  )
  return q.trim().replace(/^["']|["']$/g, '')
}
