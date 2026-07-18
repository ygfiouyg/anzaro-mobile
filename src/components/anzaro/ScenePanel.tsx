'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useSmartBallStore } from "@/lib/smart-ball-store"
import {
  Sparkles, Brain, Clapperboard, Video, Moon, Briefcase, Play, Loader2,
} from 'lucide-react'

const ICONS: Record<string, any> = {
  Brain, Clapperboard, Video, Moon, Briefcase, Sparkles,
}

const COLOR_MAP: Record<string, string> = {
  blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30 text-blue-400',
  violet: 'from-violet-500/20 to-violet-600/5 border-violet-500/30 text-violet-400',
  amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30 text-amber-400',
  indigo: 'from-indigo-500/20 to-indigo-600/5 border-indigo-500/30 text-indigo-400',
  emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30 text-emerald-400',
}

interface Scene {
  id: string
  name: string
  nameAr: string
  description: string
  triggerPhrase: string
  icon: string
  color: string
  actionsJson: string
}

export function ScenePanel() {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [executing, setExecuting] = useState<string | null>(null)
  const refreshDevices = useSmartBallStore((s) => s.setDevices)

  useEffect(() => {
    fetch('/api/scenes')
      .then((r) => r.json())
      .then((d) => setScenes(d.scenes || []))
      .catch(() => {})
  }, [])

  async function execute(scene: Scene) {
    setExecuting(scene.id)
    try {
      const res = await fetch('/api/scenes/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId: scene.id }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`نفّذت ${scene.nameAr} — ${data.results.length} جهاز اتعدّل`)
        // refresh devices
        const dr = await fetch('/api/devices')
        const dd = await dr.json()
        refreshDevices(dd.devices || [])
      } else {
        toast.error('مقدرش أنفّذ المشهد ده')
      }
    } catch {
      toast.error('حصل خطأ')
    } finally {
      setExecuting(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          المشاهد المزاجية
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">جملة وحدة تظبط كل الأجهزة</p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2.5">
        {scenes.map((s) => {
          const Icon = ICONS[s.icon] || Sparkles
          const colorClass = COLOR_MAP[s.color] || COLOR_MAP.violet
          const actions = (() => { try { return JSON.parse(s.actionsJson) } catch { return [] } })()
          return (
            <div
              key={s.id}
              className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${colorClass} p-4 transition-all hover:scale-[1.02]`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-background/40 backdrop-blur flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{s.nameAr}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{s.description}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[9px] bg-background/40 rounded-full px-1.5 py-0.5">{actions.length} جهاز</span>
                    <span className="text-[9px] bg-background/40 rounded-full px-1.5 py-0.5">{s.name}</span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => execute(s)}
                disabled={executing === s.id}
                className="w-full mt-3 h-8 rounded-xl bg-background/60 backdrop-blur hover:bg-background/80 text-foreground"
              >
                {executing === s.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    نفّذ
                  </>
                )}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
