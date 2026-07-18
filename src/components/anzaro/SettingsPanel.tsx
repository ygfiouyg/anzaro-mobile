'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'
import { useSmartBallStore } from "@/lib/smart-ball-store"
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import {
  User as UserIcon, FileText, Activity, Palette, Globe, LogOut,
  ShieldCheck, Zap, AlertTriangle, CheckCircle2, TrendingUp,
} from 'lucide-react'
import { THEME_PRESETS } from '@/lib/anzaro-types'

interface HealthData {
  healthScore: Record<string, number>
  criticalFixed: string[]
  remainingRisks: string[]
  metrics: Record<string, number>
  phasesImplemented: string[]
}

const TRAIT_LABELS: Record<string, { ar: string }> = {
  leadership: { ar: 'القيادة' },
  stubbornness: { ar: 'العناد' },
  analytical: { ar: 'التحليل' },
  emotional: { ar: 'العاطفة' },
  sociability: { ar: 'الاجتماعية' },
  discipline: { ar: 'الانضباط' },
  humor: { ar: 'الدعابة' },
}

export function SettingsPanel() {
  const { user, profile, setHue, reset } = useSmartBallStore()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [tab, setTab] = useState<'profile' | 'theme' | 'health'>('profile')

  useEffect(() => {
    authFetch('/api/anzaro/system/health').then((r) => r.json()).then(setHealth).catch(() => {})
  }, [])

  async function updateTheme(themePreset: string, hue: number) {
    setHue(hue)
    try {
      await authFetch('/api/anzaro/personality/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themePreset }),
      })
      toast.success('غيّرت الثيم')
    } catch {}
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    reset()
    window.location.reload()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-primary" />
          {user?.name || 'حسابك'}
        </h3>
        <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
        {user?.isGuest && (
          <Badge className="mt-1 text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/20">ضيف — سجعللربط بحسابك</Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border/40">
        {([
          ['profile', 'الشخصية', UserIcon],
          ['theme', 'الثيم', Palette],
          ['health', 'النظام', Activity],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              tab === id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {tab === 'profile' && profile && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs font-mono">user_personality.md</p>
                <Badge className="text-[9px] ml-auto">v{profile.version}</Badge>
              </div>
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-arabic text-foreground/90 max-h-48 overflow-y-auto scrollbar-thin" dir="rtl">
                {profile.markdown}
              </pre>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">السمات</p>
              <div className="space-y-2">
                {Object.entries(TRAIT_LABELS).map(([key, { ar }]) => {
                  const val = (profile as any)[key] as number
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-muted-foreground">{ar}</span>
                        <span className="font-mono font-medium">{val}</span>
                      </div>
                      <Progress value={val} className="h-1" />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="glass rounded-2xl p-3 text-[11px] text-muted-foreground">
              <p>التفاعلات: <span className="font-mono text-foreground">{profile.interactionCount}</span></p>
              <p className="mt-1">آخر تحديث: <span className="font-mono text-foreground">{new Date(profile.lastEvolvedAt).toLocaleDateString('ar-EG')}</span></p>
              <p className="mt-1">اللهجة: <span className="text-foreground">{profile.dialect}</span></p>
            </div>
          </div>
        )}

        {tab === 'theme' && (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">الثيم المظهري</p>
              <div className="grid grid-cols-2 gap-2">
                {THEME_PRESETS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateTheme(t.id, t.hue)}
                    className={`glass rounded-2xl p-3 text-right transition-all hover:scale-[1.02] ${
                      user?.themePreset === t.id ? 'glow-primary border-primary/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-6 h-6 rounded-full"
                        style={{ background: `oklch(0.7 0.2 ${t.hue})` }}
                      />
                      <span className="text-xs font-medium">{t.nameAr}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="glass rounded-2xl p-3 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-1.5 mb-1"><Globe className="w-3 h-3" /> اللهجة الحالية: <span className="text-foreground">{profile?.dialect || user?.dialect}</span></p>
              <p>الثيم بيتغيّر تلقائياً حسب نوع شخصيتك لما تخلص الـ onboarding.</p>
            </div>
          </div>
        )}

        {tab === 'health' && health && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(health.healthScore).map(([k, v]) => (
                <div key={k} className="glass rounded-xl p-2.5">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{k}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span className="text-lg font-bold">{v}</span>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> اتصلحت
              </p>
              <div className="space-y-1">
                {health.criticalFixed.map((f, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground flex gap-1.5">
                    <ShieldCheck className="w-2.5 h-2.5 text-emerald-400 shrink-0 mt-0.5" />
                    {f}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-amber-400 mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> مخاطر متبقية
              </p>
              <div className="space-y-1">
                {health.remainingRisks.map((r, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground flex gap-1.5">
                    <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0 mt-0.5" />
                    {r}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">المراحل المنفذة</p>
              <div className="space-y-1">
                {health.phasesImplemented.map((p, i) => (
                  <div key={i} className="text-[10px] glass rounded-lg px-2 py-1 text-foreground/80">{p}</div>
                ))}
              </div>
            </div>

            <div className="glass rounded-2xl p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">إحصائيات حية</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {Object.entries(health.metrics).slice(0, 9).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-base font-bold text-primary">{v}</p>
                    <p className="text-[9px] text-muted-foreground">{k}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/40">
        <Button variant="ghost" size="sm" onClick={logout} className="w-full text-destructive hover:text-destructive gap-2">
          <LogOut className="w-3.5 h-3.5" />
          خروج
        </Button>
      </div>
    </div>
  )
}
