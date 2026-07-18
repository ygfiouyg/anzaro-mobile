'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { authFetch } from '@/lib/auth-fetch'
import { ChatApp } from '@/components/chat/ChatApp'
import { OnboardingFlow } from '@/components/anzaro/OnboardingFlow'
import { SmartBall } from '@/components/anzaro/SmartBall'
import { HassWidget } from '@/components/dashboard/HassWidget'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { motion } from 'framer-motion'
import { Brain, Cpu, Activity, Zap, ShieldCheck, Sparkles } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()
  const [initializing, setInitializing] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [profile, setProfile] = useState<any>(null)

  // V.14: Auth check on mount
  useEffect(() => {
    const init = async () => {
      try {
        await Promise.race([
          checkAuth(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ])
      } catch {}
      setInitializing(false)
    }
    init()
  }, [checkAuth])

  // V.101: Check Identity Matrix
  useEffect(() => {
    if (!isAuthenticated || initializing) return
    const checkProfile = async () => {
      try {
        const res = await authFetch('/api/anzaro/personality/profile')
        if (res.ok) {
          const data = await res.json()
          if (!data.profile) {
            setNeedsOnboarding(true)
          } else {
            setProfile(data.profile)
            setNeedsOnboarding(false)
          }
        }
      } catch {}
    }
    checkProfile()
  }, [isAuthenticated, initializing])

  // Loading state
  if (initializing || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aurora bg-grid" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <SmartBall size={100} />
          <p className="text-sm text-muted-foreground">Anzaro بيستعد...</p>
        </div>
      </div>
    )
  }

  // Not authenticated → redirect to home (auth screen)
  if (!isAuthenticated) {
    router.push('/')
    return null
  }

  // V.101: Onboarding blocker — if no Identity Matrix, show wizard
  if (needsOnboarding) {
    return (
      <OnboardingFlow
        onComplete={() => {
          setNeedsOnboarding(false)
          // Refresh profile
          authFetch('/api/anzaro/personality/profile')
            .then((r) => r.json())
            .then((data) => { if (data.profile) setProfile(data.profile) })
            .catch(() => {})
        }}
      />
    )
  }

  // ─── Dashboard Layout ───
  return (
    <SessionProvider>
      <div className="min-h-screen flex flex-col bg-aurora bg-grid relative overflow-hidden" dir="rtl">
        {/* Ambient */}
        <div className="pointer-events-none absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px]" />

        {/* Header */}
        <header className="relative z-20 glass-strong border-b border-border/40">
          <div className="flex items-center justify-between px-4 py-2.5 max-w-[1600px] mx-auto">
            <div className="flex items-center gap-3">
              <SmartBall size={36} showLabel={false} />
              <div>
                <h1 className="text-sm font-bold">Anzaro Dashboard</h1>
                <p className="text-[9px] text-muted-foreground">لوحة التحكم الذكية</p>
              </div>
            </div>
            {profile && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                  <Brain className="w-2.5 h-2.5" />
                  {profile.personaType}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Main Grid */}
        <main className="relative z-10 flex-1 px-4 py-3 max-w-[1600px] mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-3 h-[calc(100vh-100px)]">
            {/* Left: Profile Overview + Chat */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* Profile Overview Bar */}
              {profile && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-strong rounded-2xl p-3 flex items-center gap-3 overflow-x-auto scrollbar-thin"
                >
                  <ProfileStat icon={Brain} label="الشخصية" value={profile.personaType} color="text-violet-400" />
                  <ProfileStat icon={Zap} label="القيادة" value={`${profile.leadership}/100`} color="text-amber-400" />
                  <ProfileStat icon={Activity} label="التحليل" value={`${profile.analytical}/100`} color="text-blue-400" />
                  <ProfileStat icon={ShieldCheck} label="الانضباط" value={`${profile.discipline}/100`} color="text-emerald-400" />
                  <ProfileStat icon={Sparkles} label="التفاعلات" value={`${profile.interactionCount}`} color="text-pink-400" />
                </motion.div>
              )}

              {/* Chat (flex-1) */}
              <div className="flex-1 min-h-0">
                <ChatApp />
              </div>
            </div>

            {/* Right: Smart Home Hub */}
            <div className="hidden lg:flex flex-col min-h-0">
              <div className="flex-1 min-h-0 glass-strong rounded-3xl overflow-hidden">
                <HassWidget matrix={profile ? {
                  traits: {
                    leadership: profile.leadership,
                    analyticalDepth: profile.analytical,
                    emotionalIntelligence: profile.emotional,
                    resilience: profile.discipline,
                    ambition: profile.leadership,
                  },
                  cognitiveStyle: profile.personaType === 'analytical' ? 'analytical' :
                                  profile.personaType === 'creative' ? 'creative' : 'pragmatic',
                  darkTriad: {
                    machiavellianism: profile.stubbornness,
                    narcissism: 50,
                    psychopathy: 30,
                  },
                } : undefined} />
              </div>
            </div>
          </div>
        </main>

        <footer className="relative z-10 py-2 text-center text-[10px] text-muted-foreground">
          Anzaro AI · Smart Home Hub · {profile ? `Profile v${profile.version}` : 'No profile'}
        </footer>
      </div>
    </SessionProvider>
  )
}

// ─── Profile Stat Component ───
function ProfileStat({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <div>
        <p className="text-[9px] text-muted-foreground">{label}</p>
        <p className="text-[11px] font-semibold">{value}</p>
      </div>
    </div>
  )
}
