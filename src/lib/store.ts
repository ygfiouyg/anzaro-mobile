'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BallState } from '@/lib/types'

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

interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  intent?: string
  actions?: any[]
  pending?: boolean
}

interface SessionUser {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  isGuest: boolean
  role: string
  dialect: string
  themePreset: string
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

interface AppState {
  user: SessionUser | null
  profile: PersonalityProfile | null
  view: 'loading' | 'auth' | 'onboarding' | 'dashboard'
  ball: BallState
  devices: Device[]
  mediaSession: MediaSession | null
  messages: ChatMessage[]
  conversationId: string | null
  hue: number
  rightPanel: 'devices' | 'scenes' | 'tools' | 'settings' | 'profile'

  setUser: (u: SessionUser | null) => void
  setProfile: (p: PersonalityProfile | null) => void
  setView: (v: AppState['view']) => void
  setBall: (b: Partial<BallState>) => void
  setDevices: (d: Device[]) => void
  updateDevice: (id: string, patch: Partial<Device>) => void
  setMediaSession: (m: MediaSession | null) => void
  addMessage: (m: ChatMessage) => void
  updateLastMessage: (patch: Partial<ChatMessage>) => void
  setConversationId: (id: string) => void
  clearMessages: () => void
  setHue: (h: number) => void
  setRightPanel: (p: AppState['rightPanel']) => void
  reset: () => void
}

const THEME_HUES: Record<string, number> = {
  aurora: 265,
  leadership: 205,
  creative: 325,
  calm: 165,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      profile: null,
      view: 'loading',
      ball: { status: 'idle', label: 'Idle', labelAr: 'في انتظارك', hue: 265 },
      devices: [],
      mediaSession: null,
      messages: [],
      conversationId: null,
      hue: 265,
      rightPanel: 'devices',

      setUser: (u) =>
        set((s) => ({
          user: u,
          hue: u ? THEME_HUES[u.themePreset] ?? 265 : 265,
        })),
      setProfile: (p) => set({ profile: p }),
      setView: (v) => set({ view: v }),
      setBall: (b) => set((s) => ({ ball: { ...s.ball, ...b } })),
      setDevices: (d) => set({ devices: d }),
      updateDevice: (id, patch) =>
        set((s) => ({
          devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      setMediaSession: (m) => set({ mediaSession: m }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      updateLastMessage: (patch) =>
        set((s) => {
          const msgs = [...s.messages]
          const lastIdx = msgs.length - 1
          if (lastIdx >= 0) msgs[lastIdx] = { ...msgs[lastIdx], ...patch }
          return { messages: msgs }
        }),
      setConversationId: (id) => set({ conversationId: id }),
      clearMessages: () => set({ messages: [], conversationId: null }),
      setHue: (h) => {
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--hue', String(h))
        }
        set({ hue: h, ball: { status: 'idle', label: 'Idle', labelAr: 'في انتظارك', hue: h } as BallState })
      },
      setRightPanel: (p) => set({ rightPanel: p }),
      reset: () =>
        set({
          user: null,
          profile: null,
          view: 'loading',
          messages: [],
          conversationId: null,
          mediaSession: null,
        }),
    }),
    {
      name: 'anzaro-app',
      partialize: (s) => ({
        // Only persist lightweight UI prefs; auth/profile always re-fetched from server
        rightPanel: s.rightPanel,
        hue: s.hue,
      }),
    }
  )
)
