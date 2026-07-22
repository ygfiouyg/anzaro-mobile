'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { SmartBall } from './SmartBall'
import { ChatPanel } from './ChatPanel'
import { DeviceGrid } from './DeviceGrid'
import { MediaPlayer } from './MediaPlayer'
import { ScenePanel } from './ScenePanel'
import { McpToolsPanel } from './McpToolsPanel'
import { SettingsPanel } from './SettingsPanel'
import { QuickActions } from './QuickActions'
import { ConversationSidebar } from './ConversationSidebar'
import { RoutinesPanel } from './RoutinesPanel'
import { WeatherPrayerWidget } from './WeatherPrayerWidget'
import {
  Cpu, Clapperboard, Wrench, Settings as SettingsIcon, LayoutGrid,
  Radio, Menu, X, Sparkles, Bell, MessageSquare, Calendar,
} from 'lucide-react'

type RightTab = 'conversations' | 'devices' | 'scenes' | 'routines' | 'tools' | 'settings'

export function Dashboard() {
  const { user, profile, rightPanel, setRightPanel, setBall, ball } = useAppStore()
  const [mobileRightOpen, setMobileRightOpen] = useState(false)
  const [nudge, setNudge] = useState<{ messageAr: string; severity: string } | null>(null)

  // Proactive nudge fetch (Phase 7.2)
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/proactive')
        const data = await res.json()
        if (data.fresh?.messageAr) {
          setNudge({ messageAr: data.fresh.messageAr, severity: data.fresh.severity })
        }
      } catch {}
    }, 3500)
    return () => clearTimeout(t)
  }, [])

  function fireCommand(cmd: string) {
    window.dispatchEvent(new CustomEvent('anzaro-quick-send', { detail: cmd }))
  }

  const TABS: { id: RightTab; label: string; icon: any }[] = [
    { id: 'conversations', label: 'المحادثات', icon: MessageSquare },
    { id: 'devices', label: 'الأجهزة', icon: LayoutGrid },
    { id: 'scenes', label: 'المشاهد', icon: Clapperboard },
    { id: 'routines', label: 'الروتينات', icon: Calendar },
    { id: 'tools', label: 'الأدوات', icon: Wrench },
    { id: 'settings', label: 'الإعدادات', icon: SettingsIcon },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-aurora bg-grid relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px]" />

      {/* Header */}
      <header className="relative z-20 glass-strong border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-2.5 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">Anzaro AI</h1>
                <p className="text-[9px] text-muted-foreground leading-tight">The Smart Ball</p>
              </div>
            </div>
            {profile && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                <Cpu className="w-2.5 h-2.5" />
                {profile.personaType} · {profile.dialect}
              </span>
            )}
          </div>

          {/* Weather + Prayer widget (desktop) */}
          <div className="hidden lg:block w-[320px]">
            <WeatherPrayerWidget />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setNudge(null)}
              className="relative w-8 h-8 rounded-xl glass flex items-center justify-center hover:bg-accent/50 transition-colors"
              title="الإشعارات"
            >
              <Bell className="w-4 h-4" />
              {nudge && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse-dot" />
              )}
            </button>
            <button
              onClick={() => setMobileRightOpen(true)}
              className="lg:hidden w-8 h-8 rounded-xl glass flex items-center justify-center"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Proactive nudge banner (Phase 7.2) */}
      <AnimatePresence>
        {nudge && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 px-4 pt-3 max-w-[1600px] mx-auto w-full"
          >
            <div className="glass-strong rounded-2xl px-4 py-2.5 flex items-center gap-3 glow-primary">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <p className="text-xs flex-1" dir="rtl">{nudge.messageAr}</p>
              <button onClick={() => setNudge(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main grid */}
      <main className="relative z-10 flex-1 px-4 py-3 max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-3 h-[calc(100vh-120px)]">
          {/* Left: quick actions + chat + media */}
          <div className="flex flex-col gap-3 min-h-0">
            {/* Quick actions bar */}
            <div className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
              <QuickActions onFire={fireCommand} />
            </div>

            {/* Chat (flex-1) */}
            <div className="flex-1 min-h-0">
              <ChatPanelWithBridge />
            </div>

            {/* Media player */}
            <MediaPlayer />
          </div>

          {/* Right: tabbed panel */}
          <div className="hidden lg:flex flex-col min-h-0">
            <RightPanelTabs
              tabs={TABS}
              active={rightPanel as RightTab}
              onChange={(t) => setRightPanel(t)}
            />
            <div className="flex-1 min-h-0 glass-strong rounded-3xl rounded-t-none overflow-hidden">
              <RightPanelContent tab={rightPanel as RightTab} />
            </div>
          </div>
        </div>
      </main>

      {/* Mobile right panel drawer */}
      <AnimatePresence>
        {mobileRightOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileRightOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed top-0 right-0 bottom-0 w-[85%] max-w-sm z-50 glass-strong border-l border-border/40 flex flex-col"
            >
              <div className="flex items-center justify-between p-3 border-b border-border/40">
                <RightPanelTabs
                  tabs={TABS}
                  active={rightPanel as RightTab}
                  onChange={(t) => { setRightPanel(t); }}
                  compact
                />
                <button onClick={() => setMobileRightOpen(false)} className="w-8 h-8 rounded-lg glass flex items-center justify-center shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <RightPanelContent tab={rightPanel as RightTab} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <footer className="relative z-10 py-2 text-center text-[10px] text-muted-foreground">
        Anzaro AI · Local-First · {user?.isGuest ? 'Guest Session' : 'Google Account'}
      </footer>
    </div>
  )
}

function RightPanelTabs({
  tabs,
  active,
  onChange,
  compact,
}: {
  tabs: { id: RightTab; label: string; icon: any }[]
  active: RightTab
  onChange: (t: RightTab) => void
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-1 ${compact ? 'flex-1 overflow-x-auto scrollbar-thin' : 'glass-strong rounded-3xl rounded-b-none p-1.5 border-b-0'}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
            active === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
          }`}
        >
          <t.icon className="w-3.5 h-3.5" />
          {!compact && t.label}
        </button>
      ))}
    </div>
  )
}

function RightPanelContent({ tab }: { tab: RightTab }) {
  if (tab === 'conversations') return <ConversationSidebar />
  if (tab === 'devices') return <DeviceGrid />
  if (tab === 'scenes') return <ScenePanel />
  if (tab === 'routines') return <RoutinesPanel />
  if (tab === 'tools') return <McpToolsPanel />
  return <SettingsPanel />
}

// Bridge: listens for quick-action events and forwards them to ChatPanel
function ChatPanelWithBridge() {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string
      window.dispatchEvent(new CustomEvent('anzaro-inject-input', { detail }))
    }
    window.addEventListener('anzaro-quick-send', handler)
    return () => window.removeEventListener('anzaro-quick-send', handler)
  }, [])
  return <ChatPanel />
}
