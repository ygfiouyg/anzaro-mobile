'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'
import { useSmartBallStore } from "@/lib/smart-ball-store"
import { toast } from 'sonner'
import { Zap, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface QuickAction {
  id: string
  label: string
  labelAr: string | null
  command: string
  actionType: string
  icon: string
  useCount: number
  isPinned: boolean
}

export function QuickActions({ onFire }: { onFire: (command: string) => void }) {
  const [actions, setActions] = useState<QuickAction[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [open, setOpen] = useState(false)

  async function refresh() {
    try {
      const res = await authFetch('/api/anzaro/quickactions')
      const data = await res.json()
      setActions(data.actions || [])
    } catch {}
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await authFetch('/api/anzaro/quickactions')
        const data = await res.json()
        if (active) setActions(data.actions || [])
      } catch {}
    })()
    return () => {
      active = false
    }
  }, [])

  async function fire(a: QuickAction) {
    onFire(a.command)
    authFetch('/api/anzaro/quickactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id }),
    })
    refresh()
  }

  async function add() {
    if (!newLabel.trim()) return
    try {
      await authFetch('/api/anzaro/quickactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, command: newLabel, actionType: 'natural' }),
      })
      setNewLabel('')
      setOpen(false)
      refresh()
      toast.success('ضفت زر سريع جديد')
    } catch {}
  }

  const pinned = actions.filter((a) => a.isPinned).slice(0, 6)

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        <Zap className="w-3 h-3 text-primary" />
        سريع
      </span>
      {pinned.map((a) => (
        <button
          key={a.id}
          onClick={() => fire(a)}
          className="glass rounded-full px-3 py-1.5 text-[11px] font-medium hover:bg-accent/50 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
        >
          {a.label}
          {a.useCount > 0 && (
            <span className="text-[9px] text-muted-foreground">{a.useCount}</span>
          )}
        </button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-accent/50 transition-all">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <p className="text-xs font-medium mb-2">زر سريع جديد</p>
          <div className="flex gap-1.5">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="مثلاً: شغّل قرآن"
              className="h-8 text-xs rounded-lg"
              dir="rtl"
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <Button size="sm" onClick={add} className="h-8 rounded-lg">تم</Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">الزر ده هيشتغل كأنك بتبعت الأمر ده للشات.</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
