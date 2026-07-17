'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { AuthScreen } from '@/components/anzaro/AuthScreen'
import { OnboardingFlow } from '@/components/anzaro/OnboardingFlow'
import { Dashboard } from '@/components/anzaro/Dashboard'
import { SmartBall } from '@/components/anzaro/SmartBall'

export default function Home() {
  const { user, profile, view, setView, setUser, setProfile, setHue } = useAppStore()

  // Initial bootstrap: fetch session + profile
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        const res = await fetch('/api/auth/session')
        const data = await res.json()
        if (cancelled) return
        if (data.user) {
          setUser(data.user)
          // apply theme hue
          const hues: Record<string, number> = {
            aurora: 265, leadership: 205, creative: 325, calm: 165,
          }
          setHue(hues[data.user.themePreset] ?? 265)

          // fetch profile
          const pr = await fetch('/api/personality/profile')
          const pd = await pr.json()
          if (cancelled) return
          if (pd.profile) {
            setProfile(pd.profile)
            setView('dashboard')
          } else {
            setView('onboarding')
          }
        } else {
          setView('auth')
        }
      } catch {
        if (!cancelled) setView('auth')
      }
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-aurora bg-grid">
        <SmartBall size={120} />
        <p className="mt-6 text-sm text-muted-foreground">Anzaro بيستعد...</p>
      </div>
    )
  }

  if (view === 'auth' || !user) {
    return <AuthScreen />
  }

  if (view === 'onboarding' || (user && !profile)) {
    return <OnboardingFlow />
  }

  return <Dashboard />
}
