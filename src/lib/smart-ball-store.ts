'use client'

import { create } from 'zustand'
import type { BallState } from './anzaro-types'

// Smart Ball store — isolated from the main chat-store to avoid conflicts.
// Manages: ball state, devices, media session, personality profile, quick actions, theme hue.
interface Device {
  id: string
  entityId: string
  friendlyName: string
  domain: string
  room: string
  state: string
  attributesJson: string
  aliasesJson: string
  icon: string | null
}

interface MediaSession {
  id: string
  type: string
  title: string
  source: string
  streamUrl: string | null
  stationId: string | null
  status: string
  volume: number
}

interface PersonalityProfile {
  id: string
  markdown: string
  name: string
  age: number | null
  occupation: string | null
  personaType: string
  dialect: string
  leadership: number
  stubbornness: number
  analytical: number
  emotional: number
  sociability: number
  discipline: number
  humor: number
  driversJson: string
  preferencesJson: string
  triggersJson: string
  version: number
  interactionCount: number
}

interface SmartBallState {
  ball: BallState
  devices: Device[]
  mediaSession: MediaSession | null
  profile: PersonalityProfile | null
  hue: number
  panelOpen: boolean
  rightPanel: 'devices' | 'scenes' | 'routines' | 'tools' | 'profile'

  setBall: (b: Partial<BallState>) => void
  setDevices: (d: Device[]) => void
  updateDevice: (id: string, patch: Partial<Device>) => void
  setMediaSession: (m: MediaSession | null) => void
  setProfile: (p: PersonalityProfile | null) => void
  setHue: (h: number) => void
  setPanelOpen: (o: boolean) => void
  setRightPanel: (p: SmartBallState['rightPanel']) => void
}

const THEME_HUES: Record<string, number> = {
  aurora: 265,
  leadership: 205,
  creative: 325,
  calm: 165,
}

export const useSmartBallStore = create<SmartBallState>((set) => ({
  ball: { status: 'idle', label: 'Idle', labelAr: 'في انتظارك', hue: 265 },
  devices: [],
  mediaSession: null,
  profile: null,
  hue: 265,
  panelOpen: false,
  rightPanel: 'devices',

  setBall: (b) => set((s) => ({ ball: { ...s.ball, ...b } })),
  setDevices: (d) => set({ devices: d }),
  updateDevice: (id, patch) =>
    set((s) => ({
      devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  setMediaSession: (m) => set({ mediaSession: m }),
  setProfile: (p) => set({ profile: p }),
  setHue: (h) => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--ball-hue', String(h))
    }
    set({ hue: h, ball: { status: 'idle', label: 'Idle', labelAr: 'في انتظارك', hue: h } as BallState })
  },
  setPanelOpen: (o) => set({ panelOpen: o }),
  setRightPanel: (p) => set({ rightPanel: p }),
}))

export { THEME_HUES }
