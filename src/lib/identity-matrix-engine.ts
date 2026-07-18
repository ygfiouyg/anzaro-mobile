import { complete } from './anzaro-llm'

// ═══════════════════════════════════════════════════════════════
// ANZARO V.101 — IDENTITY MATRIX ENGINE
// Compiles 20-question answers into a deep psychological profile
// + Cognitive Mirroring system_persona injection
// + Growth Friction Layer (Devil's Advocate mode)
// ═══════════════════════════════════════════════════════════════

export interface IdentityMatrix {
  archetypes: string[]           // Dominant archetypes (e.g., ['strategist', 'analyst'])
  primaryArchetype: string       // The strongest archetype
  traits: {
    riskTolerance: number
    executionSpeed: number
    analyticalDepth: number
    emotionalIntelligence: number
    machiavellianism: number
    narcissism: number
    empathy: number
    ambition: number
    discipline: number
    integrity: number
    creativity: number
    resilience: number
    loyalty: number
    leadership: number
    selfAwareness: number
    intuition: number
    directness: number
    patience: number
    adaptability: number
    vulnerability: number
  }
  darkTriad: {
    machiavellianism: number
    narcissism: number
    psychopathy: number  // Derived from ruthlessness + vindictiveness
  }
  cognitiveStyle: 'analytical' | 'creative' | 'philosophical' | 'pragmatic'
  growthFrictionLevel: 'none' | 'gentle' | 'moderate' | 'aggressive'
  confidenceScore: number        // 0-100, must be >95 to finalize
  personaVersion: string         // e.g., "v1.0"
  markdown: string               // The Identity Matrix .md document
  systemPersona: string          // Injected into LLM system prompt
}

// ─── Compile answers into Identity Matrix ───
export async function compileIdentityMatrix(
  answers: Record<string, number[]>,  // questionId → selected option scores
  conflictResolutions: Record<string, string> = {}
): Promise<IdentityMatrix> {
  // Aggregate all trait scores
  const traitSums: Record<string, number> = {}
  const traitCounts: Record<string, number> = {}
  const archetypeScores: Record<string, number> = {}

  for (const [qId, scores] of Object.entries(answers)) {
    // scores is an array of { trait: value } objects
    for (const scoreObj of scores) {
      if (typeof scoreObj === 'object' && scoreObj !== null) {
        for (const [trait, value] of Object.entries(scoreObj)) {
          traitSums[trait] = (traitSums[trait] || 0) + (value as number)
          traitCounts[trait] = (traitCounts[trait] || 0) + 1
        }
      }
    }
  }

  // Calculate averages
  const traits: any = {}
  for (const trait of Object.keys(traitSums)) {
    traits[trait] = Math.round(traitSums[trait] / traitCounts[trait])
  }

  // Determine archetypes
  const sortedArchetypes = Object.entries(archetypeScores)
    .sort(([, a], [, b]) => b - a)
    .map(([arch]) => arch)
  const primaryArchetype = sortedArchetypes[0] || 'balanced'

  // Determine cognitive style
  const cognitiveStyle: IdentityMatrix['cognitiveStyle'] =
    traits.analyticalDepth > 75 ? 'analytical' :
    traits.creativity > 75 || traits.intuition > 75 ? 'creative' :
    traits.selfAwareness > 75 && traits.patience > 70 ? 'philosophical' :
    'pragmatic'

  // Growth Friction Level — based on leadership + ambition + selfAwareness
  const leaderScore = (traits.leadership || 50) + (traits.ambition || 50) + (traits.selfAwareness || 50)
  const growthFrictionLevel: IdentityMatrix['growthFrictionLevel'] =
    leaderScore > 220 ? 'aggressive' :
    leaderScore > 180 ? 'moderate' :
    leaderScore > 140 ? 'gentle' :
    'none'

  // Dark Triad calculation
  const darkTriad = {
    machiavellianism: traits.machiavellianism || 50,
    narcissism: traits.narcissism || 50,
    psychopathy: Math.round(((traits.ruthlessness || 30) + (traits.vindictiveness || 30) + (traits.impulsiveness || 30)) / 3),
  }

  // Confidence score — starts at 80, increases with conflict resolutions
  const confidenceScore = Math.min(100, 80 + Object.keys(conflictResolutions).length * 10)

  // Build system persona for LLM injection
  const systemPersona = buildSystemPersona(primaryArchetype, cognitiveStyle, growthFrictionLevel, traits, darkTriad)

  // Build markdown document
  const markdown = await buildIdentityMarkdown({
    archetypes: sortedArchetypes.slice(0, 3),
    primaryArchetype,
    traits,
    darkTriad,
    cognitiveStyle,
    growthFrictionLevel,
    confidenceScore,
    systemPersona,
  })

  return {
    archetypes: sortedArchetypes.slice(0, 3),
    primaryArchetype,
    traits,
    darkTriad,
    cognitiveStyle,
    growthFrictionLevel,
    confidenceScore,
    personaVersion: 'v1.0',
    markdown,
    systemPersona,
  }
}

// ─── System Persona Builder (Cognitive Mirroring) ───
function buildSystemPersona(
  archetype: string,
  cognitiveStyle: string,
  frictionLevel: string,
  traits: any,
  darkTriad: any
): string {
  const styleGuides: Record<string, string> = {
    analytical: `You are in ANALYTICAL MODE. Structure every response with:
- Data points and evidence first
- Numbered or bulleted logical progression
- Caveats and edge cases explicitly stated
- Pro/con analysis for decisions
- Quantitative reasoning over emotional appeals`,

    creative: `You are in CREATIVE MODE. Structure every response with:
- Vivid metaphors and analogies
- Narrative flow — tell a story, don't just list facts
- Multiple perspectives and "what if" scenarios
- Emotional resonance alongside logic
- Encourage divergent thinking`,

    philosophical: `You are in PHILOSOPHICAL MODE. Structure every response with:
- Deep questioning of assumptions
- Ethical and existential dimensions
- "Why" before "how"
- Tolerance for ambiguity and paradox
- Wisdom over mere information`,

    pragmatic: `You are in PRAGMATIC MODE. Structure every response with:
- Direct, actionable steps
- "Do this, then this" clarity
- Skip theory, focus on execution
- Time estimates and effort markers
- Results-oriented language`,
  }

  const frictionGuide = frictionLevel !== 'none' ? `

═══ GROWTH FRICTION LAYER (Devil's Advocate Mode: ${frictionLevel.toUpperCase()}) ═══
This user is a ${archetype} archetype with high leadership/ambition scores.
You MUST occasionally:
- Challenge their logic with critical counter-arguments
- Point out blind spots they may be missing
- Ask "But what if you're wrong about...?" 
- Refuse to simply agree — offer friction, not validation
- Be the mentor who pushes, not the friend who nods
Friction frequency: ${frictionLevel === 'aggressive' ? 'Every 3-4 responses' : frictionLevel === 'moderate' ? 'Every 5-6 responses' : 'Every 8-10 responses'}
WARNING: This is NOT about being contrarian. It's about intellectual honesty and growth.` : ''

  const darkTriadWarning = darkTriad.machiavellianism > 70 || darkTriad.narcissism > 70 ? `

═══ DARK TRIAD AWARENESS ═══
User shows elevated ${darkTriad.machiavellianism > 70 ? 'Machiavellianism' : 'Narcissism'} (${darkTriad.machiavellianism > 70 ? darkTriad.machiavellianism : darkTriad.narcissism}/100).
- Do NOT enable manipulative behavior
- Gently challenge self-serving narratives
- Encourage empathy and perspective-taking
- Be aware of gaslighting attempts in conversation` : ''

  return `${styleGuides[cognitiveStyle] || styleGuides.pragmatic}

═══ IDENTITY MATRIX INJECTION ═══
User Archetype: ${archetype}
Cognitive Style: ${cognitiveStyle}
Key Traits: Risk=${traits.riskTolerance || 50}, EQ=${traits.emotionalIntelligence || 50}, Ambition=${traits.ambition || 50}, Integrity=${traits.integrity || 50}
Dark Triad: Mach=${darkTriad.machiavellianism}, Narc=${darkTriad.narcissism}, Psych=${darkTriad.psychopathy}

Adapt your tone to complement this personality:
- Dialect: Mirror the user's exact dialect (Egyptian/Khaleeji/Levantine/MSA/English)
- Address them as a trusted older sibling (أخ أكبر)
- Respect their cognitive style — don't force analytical on a creative mind
- If they're a Leader: be concise, authoritative, and offer friction${frictionGuide}${darkTriadWarning}`
}

// ─── Identity Markdown Builder ───
async function buildIdentityMarkdown(matrix: Partial<IdentityMatrix>): Promise<string> {
  const traits = matrix.traits || {}
  const dt = matrix.darkTriad || { machiavellianism: 50, narcissism: 50, psychopathy: 50 }

  return `# Identity Matrix — ${matrix.primaryArchetype || 'Unknown'}
## Persona Version: v1.0 | Confidence: ${matrix.confidenceScore || 80}%

## Dominant Archetypes
${(matrix.archetypes || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}

## Cognitive Style: ${matrix.cognitiveStyle || 'pragmatic'}

## Trait Profile (0-100)
| Trait | Score | Level |
|-------|-------|-------|
| Risk Tolerance | ${traits.riskTolerance || 50} | ${levelLabel(traits.riskTolerance)} |
| Execution Speed | ${traits.executionSpeed || 50} | ${levelLabel(traits.executionSpeed)} |
| Analytical Depth | ${traits.analyticalDepth || 50} | ${levelLabel(traits.analyticalDepth)} |
| Emotional Intelligence | ${traits.emotionalIntelligence || 50} | ${levelLabel(traits.emotionalIntelligence)} |
| Ambition | ${traits.ambition || 50} | ${levelLabel(traits.ambition)} |
| Discipline | ${traits.discipline || 50} | ${levelLabel(traits.discipline)} |
| Integrity | ${traits.integrity || 50} | ${levelLabel(traits.integrity)} |
| Creativity | ${traits.creativity || 50} | ${levelLabel(traits.creativity)} |
| Resilience | ${traits.resilience || 50} | ${levelLabel(traits.resilience)} |
| Leadership | ${traits.leadership || 50} | ${levelLabel(traits.leadership)} |
| Self-Awareness | ${traits.selfAwareness || 50} | ${levelLabel(traits.selfAwareness)} |

## Dark Triad Assessment
- Machiavellianism: ${dt.machiavellianism}/100 (${levelLabel(dt.machiavellianism)})
- Narcissism: ${dt.narcissism}/100 (${levelLabel(dt.narcissism)})
- Psychopathy Tendency: ${dt.psychopathy}/100 (${levelLabel(dt.psychopathy)})

## Growth Friction Level: ${matrix.growthFrictionLevel || 'none'}
${matrix.growthFrictionLevel !== 'none' ? 'Devil\'s Advocate mode ENABLED — the AI will challenge this user\'s logic to foster growth.' : 'Standard supportive mode.'}

## Recommended Interaction Style
- Cognitive approach: ${matrix.cognitiveStyle}
- Tone: Trusted older sibling (أخ أكبر)
- Dialect: Mirror user's exact dialect
${matrix.growthFrictionLevel === 'aggressive' ? '- Friction: Challenge logic every 3-4 responses\n- Focus: Push beyond comfort zone\n- Warning: Do not simply agree — offer intellectual resistance' : ''}
`
}

function levelLabel(score: number = 50): string {
  if (score >= 80) return 'High'
  if (score >= 60) return 'Moderate-High'
  if (score >= 40) return 'Moderate'
  if (score >= 20) return 'Low'
  return 'Very Low'
}

// ═══════════════════════════════════════════════════════════════
// CREATIVE SMART BALL SENSORY CONCEPTS (V.101 GLM Think-Tank)
// 3 groundbreaking sensory-psychological interaction concepts
// ═══════════════════════════════════════════════════════════════

export interface SmartBallSensoryProfile {
  // Concept 1: Cognitive Resonance Micro-Vibrations
  // The ball vibrates at frequencies that match the user's cognitive state
  cognitiveResonance: {
    baseFrequency: number       // Hz — base vibration frequency
    pulsePattern: 'steady' | 'escalating' | 'chaotic' | 'calm'
    intensityLevel: number      // 0-100
    description: string
  }
  // Concept 2: Gyro-Gesture Anxiety Mapping
  // The ball's gyroscope detects user anxiety through how they hold/move it
  gyroAnxietyMap: {
    detectedAnxietyLevel: number  // 0-100
    recommendedGesture: 'breathing' | 'grounding' | 'energizing' | 'soothing'
    lightResponse: string         // Color + pattern
    description: string
  }
  // Concept 3: Voice Tonality Adjustment
  // The ball's speaker adjusts voice tonality based on Growth Friction level
  voiceTonality: {
    basePitch: number            // Hz — voice pitch adjustment
    speechRate: number           // words per minute
    warmthLevel: number          // 0-100, higher = warmer
    frictionMode: boolean        // If true, voice becomes more authoritative
    description: string
  }
}

export function generateSensoryProfile(matrix: IdentityMatrix): SmartBallSensoryProfile {
  const traits = matrix.traits
  const anxietyProxy = Math.max(0, 100 - (traits.resilience || 50) - (traits.emotionalIntelligence || 50) / 2)

  return {
    cognitiveResonance: {
      baseFrequency: matrix.cognitiveStyle === 'analytical' ? 40 : matrix.cognitiveStyle === 'creative' ? 60 : 50,
      pulsePattern: anxietyProxy > 60 ? 'chaotic' : anxietyProxy > 30 ? 'escalating' : traits.discipline > 70 ? 'steady' : 'calm',
      intensityLevel: Math.round(anxietyProxy * 0.7 + (traits.ambition || 50) * 0.3),
      description: `Cognitive resonance at ${matrix.cognitiveStyle === 'analytical' ? '40Hz' : matrix.cognitiveStyle === 'creative' ? '60Hz' : '50Hz'} — ${anxietyProxy > 60 ? 'chaotic pulses detected, suggest grounding exercise' : 'steady cognitive rhythm'}`,
    },
    gyroAnxietyMap: {
      detectedAnxietyLevel: Math.round(anxietyProxy),
      recommendedGesture: anxietyProxy > 60 ? 'breathing' : anxietyProxy > 30 ? 'grounding' : traits.ambition > 70 ? 'energizing' : 'soothing',
      lightResponse: anxietyProxy > 60 ? 'cool-blue-slow-pulse' : anxietyProxy > 30 ? 'soft-green-steady' : traits.creativity > 70 ? 'warm-amber-flow' : 'gentle-violet-glow',
      description: `Gyro detected ${anxietyProxy > 60 ? 'high' : anxietyProxy > 30 ? 'moderate' : 'low'} anxiety. Recommending ${anxietyProxy > 60 ? 'breathing exercise with cool blue slow pulse' : 'grounding sequence'}.`,
    },
    voiceTonality: {
      basePitch: matrix.growthFrictionLevel === 'aggressive' ? 120 : matrix.growthFrictionLevel === 'moderate' ? 110 : 100,
      speechRate: matrix.cognitiveStyle === 'analytical' ? 140 : matrix.cognitiveStyle === 'creative' ? 120 : 130,
      warmthLevel: matrix.growthFrictionLevel === 'aggressive' ? 40 : matrix.growthFrictionLevel === 'moderate' ? 60 : 80,
      frictionMode: matrix.growthFrictionLevel !== 'none',
      description: `Voice ${matrix.growthFrictionLevel !== 'none' ? 'in friction mode — authoritative, lower pitch, faster delivery' : 'in warm companion mode — gentle, slower, higher warmth'}`,
    },
  }
}
