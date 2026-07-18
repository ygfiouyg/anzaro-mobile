'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'
import { useSmartBallStore } from "@/lib/smart-ball-store"
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Calendar, Sparkles, Zap, RefreshCw, Plus, Clock } from 'lucide-react'
import { motion } from 'framer-motion'

interface Routine {
  id: string
  name: string
  nameAr: string
  description: string
  triggerJson: string
  actionsJson: string
  learnedFrom: string | null
  confidence: number
  isEnabled: boolean
}

export function RoutinesPanel() {
  const user = useSmartBallStore((s) => s.user)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [suggesting, setSuggesting] = useState(false)

  async function refresh() {
    try {
      const res = await authFetch('/api/anzaro/routines')
      const data = await res.json()
      setRoutines(data.routines || [])
    } catch {}
  }

  useEffect(() => {
    refresh()
  }, [])

  async function suggest() {
    setSuggesting(true)
    try {
      const res = await authFetch('/api/anzaro/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'اقترح روتين ذكي' }),
      })
      const data = await res.json()
      if (data.routine) {
        toast.success(`اقترحت روتين جديد: ${data.routine.nameAr}`)
        refresh()
      } else {
        toast.error('مقدرش أقترح روتين دلوقتي')
      }
    } catch {
      toast.error('حصل خطأ')
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            الروتينات
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">أتمتة ذكية تتعلم منك</p>
        </div>
        <Button size="sm" onClick={suggest} disabled={suggesting} className="h-7 gap-1 text-xs rounded-lg">
          {suggesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          اقترح
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2.5">
        {routines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">مفيش روتينات لسه</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1 max-w-[200px]">
              دوس "اقترح" خلّي الـ AI يحلل شخصيتك ويقترح روتين يناسبك
            </p>
          </div>
        ) : (
          routines.map((r, i) => {
            const actions = (() => { try { return JSON.parse(r.actionsJson || '[]') } catch { return [] } })()
            const trigger = (() => { try { return JSON.parse(r.triggerJson || '{}') } catch { return {} } })()
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl p-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    r.learnedFrom === 'ai_suggested' ? 'bg-violet-500/15 text-violet-400' : 'bg-primary/15 text-primary'
                  }`}>
                    {r.learnedFrom === 'ai_suggested' ? <Sparkles className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold truncate">{r.nameAr}</p>
                      <Badge className="text-[9px] h-4 px-1 bg-primary/10 text-primary border-primary/20">
                        {r.confidence}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{r.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {trigger.type === 'schedule' && (
                        <span className="text-[9px] bg-muted/40 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                          <Clock className="w-2 h-2" /> {trigger.time || 'وقت'}
                        </span>
                      )}
                      <span className="text-[9px] bg-muted/40 rounded-full px-1.5 py-0.5">{actions.length} إجراء</span>
                      {r.learnedFrom === 'ai_suggested' && (
                        <span className="text-[9px] bg-violet-500/10 text-violet-400 rounded-full px-1.5 py-0.5">AI</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}
