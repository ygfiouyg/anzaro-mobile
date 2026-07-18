// Anzaro AI — Shared domain types

export type PersonaType = 'leader' | 'analytical' | 'creative' | 'emotional' | 'balanced'

export interface DeviceAlias {
  alias: string
  lang: 'ar' | 'en'
}

export interface DeviceAction {
  entityId: string
  action: 'turn_on' | 'turn_off' | 'toggle' | 'set_state'
  domain?: string
  params?: Record<string, unknown>
}

export interface SceneAction {
  entityId: string
  action: 'turn_on' | 'turn_off' | 'set_state'
  params?: Record<string, unknown>
}

export interface MediaIntent {
  type: 'play' | 'pause' | 'resume' | 'stop' | 'next' | 'previous' | 'volume'
  stationId?: string
  query?: string
  volume?: number
}

export interface DeviceIntent {
  type: 'device_control'
  entityId?: string
  alias?: string
  action: 'turn_on' | 'turn_off' | 'toggle' | 'set_state'
  params?: Record<string, unknown>
}

export interface SceneIntent {
  type: 'scene'
  sceneId?: string
  name?: string
}

export interface ChatIntent {
  type: 'chat' | 'media' | 'device' | 'scene' | 'mcp'
  media?: MediaIntent
  device?: DeviceIntent
  scene?: SceneIntent
  mcpTool?: string
  mcpArgs?: Record<string, unknown>
}

export interface PersonalityTraits {
  leadership: number
  stubbornness: number
  analytical: number
  emotional: number
  sociability: number
  discipline: number
  humor: number
}

export interface OnboardingQuestion {
  id: string
  question: string
  questionAr: string
  category: 'demographic' | 'psychological' | 'preference' | 'driver'
  inputType: 'text' | 'choice' | 'scale'
  options?: string[]
  optionsAr?: string[]
  traitKey?: keyof PersonalityTraits
}

export interface BallState {
  status: 'idle' | 'listening' | 'processing' | 'executing' | 'speaking' | 'error'
  label: string
  labelAr: string
  hue: number // color hue for the orb glow
}

// ───────────────── Theme presets (Phase 8) ─────────────────

export interface ThemePreset {
  id: string
  name: string
  nameAr: string
  hue: number
  description: string
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'aurora', name: 'Aurora', nameAr: 'الشفق', hue: 265, description: 'Balanced violet-teal glow' },
  { id: 'leadership', name: 'Command', nameAr: 'القيادة', hue: 200, description: 'High-contrast efficiency' },
  { id: 'creative', name: 'Creative', nameAr: 'الإبداع', hue: 320, description: 'Warm pastel inspirations' },
  { id: 'calm', name: 'Calm', nameAr: 'الهدوء', hue: 160, description: 'Soft green serenity' },
]
