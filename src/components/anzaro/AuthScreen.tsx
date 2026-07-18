'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { SmartBall } from './SmartBall'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Sparkles, ShieldCheck, Zap, Brain } from 'lucide-react'

export function AuthScreen() {
  const setUser = useAppStore((s) => s.setUser)
  const setView = useAppStore((s) => s.setView)
  const [loading, setLoading] = useState<'google' | 'guest' | null>(null)

  async function handleGuest() {
    setLoading('guest')
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' })
      const data = await res.json()
      if (data.user) {
        setUser(data.user)
        toast.success('أهلاً بيك! خلّينا نتعرف عليك.')
        setView('onboarding')
      }
    } catch {
      toast.error('مقدرنش نعمل جلسة ضيف')
    } finally {
      setLoading(null)
    }
  }

  async function handleGoogle() {
    setLoading('google')
    try {
      // Phase 4: simulate the Google account selector flow.
      // In production this redirects to Google's consent screen.
      // Here we present a mock account picker, then bind the chosen profile.
      const mockAccounts = [
        { googleId: 'g_1001', email: 'abs@anzaro.dev', name: 'Abs', avatarUrl: '' },
        { googleId: 'g_1002', email: 'sara.k@anzaro.dev', name: 'Sara', avatarUrl: '' },
        { googleId: 'g_1003', email: 'omar@anzaro.dev', name: 'Omar', avatarUrl: '' },
      ]

      const chosen = mockAccounts[Math.floor(Math.random() * mockAccounts.length)]
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chosen),
      })
      const data = await res.json()
      if (data.user) {
        setUser(data.user)
        if (data.migrated) {
          toast.success(`أهلاً ${data.user.name}! نقلنا ملفك الشخصي لحسابك الدايم. 🔒`)
        } else {
          toast.success(`أهلاً ${data.user.name}!`)
        }
        // Profile is fetched by the orchestrator; go to dashboard or onboarding
        setView('loading')
        // Re-fetch session to load profile state
        setTimeout(() => window.location.reload(), 600)
      }
    } catch {
      toast.error('فشل تسجيل الدخول بجوجل')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-aurora bg-grid relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/20 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-[100px]" />

      <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong rounded-3xl p-8 glow-primary"
          >
            {/* Hero ball */}
            <div className="flex flex-col items-center mb-8">
              <SmartBall size={140} />
              <h1 className="mt-6 text-3xl font-bold text-gradient">Anzaro AI</h1>
              <p className="text-sm text-muted-foreground mt-1">الكرة الذكية — عقلك في البيت</p>
            </div>

            {/* Feature chips */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              <FeatureChip icon={Brain} title="شخصيتك" desc="بيفهمك ويتكلم بلهجتك" />
              <FeatureChip icon={Zap} title="تحكم فوري" desc="أوامرك تنفّذ على طول" />
              <FeatureChip icon={ShieldCheck} title="محلي أولاً" desc="خصوصيتك في بيتك" />
              <FeatureChip icon={Sparkles} title="استباقي" desc="بيحس بيك قبل ما تطلب" />
            </div>

            {/* Auth buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleGoogle}
                disabled={loading !== null}
                size="lg"
                className="w-full h-12 rounded-2xl bg-white text-slate-900 hover:bg-white/90 dark:bg-white dark:text-slate-900 font-medium gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {loading === 'google' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                    جاري الدخول...
                  </span>
                ) : (
                  <>
                    <GoogleIcon />
                    متابعة بحساب Google
                  </>
                )}
              </Button>

              <Button
                onClick={handleGuest}
                disabled={loading !== null}
                size="lg"
                variant="ghost"
                className="w-full h-12 rounded-2xl border border-border/60 hover:bg-accent/50 transition-all"
              >
                {loading === 'guest' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    جاري التجهيز...
                  </span>
                ) : (
                  'الدخول كضيف'
                )}
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center mt-6 leading-relaxed">
              بحسابك في Google، ملفك الشخصي وتفضيلاتك بترتبط دايماً بحسابك.
              <br />
              الضيف بيتخزن محلياً وبيتنقل لحسابك أول ما تسجل.
            </p>
          </motion.div>
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-xs text-muted-foreground">
        Anzaro AI · The Smart Ball · Local-First AI Home OS
      </footer>
    </div>
  )
}

function FeatureChip({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="glass rounded-2xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
