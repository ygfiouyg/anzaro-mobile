'use client'

import { useSmartBallStore } from "@/lib/smart-ball-store"
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import {
  Lightbulb, Tv, Wind, Blinds, Fan, BellOff, Lamp,
  Plus, Search,
} from 'lucide-react'

const ICONS: Record<string, any> = {
  Lightbulb, Tv, Wind, Blinds, Fan, BellOff, Lamp,
}

export function DeviceGrid() {
  const { devices, setDevices, updateDevice } = useSmartBallStore()
  const [filter, setFilter] = useState('')
  const [aliasFor, setAliasFor] = useState<string | null>(null)
  const [aliasText, setAliasText] = useState('')

  async function refresh() {
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      setDevices(data.devices || [])
    } catch {}
  }

  useEffect(() => {
    if (devices.length === 0) refresh()
  }, [])

  async function toggle(device: any) {
    const action = device.state === 'on' ? 'turn_off' : 'turn_on'
    // optimistic
    updateDevice(device.id, { state: action === 'turn_on' ? 'on' : 'off' })
    try {
      await fetch('/api/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, action }),
      })
      await refresh()
    } catch {
      toast.error('مقدرش أتحكم في الجهاز ده')
      updateDevice(device.id, { state: device.state })
    }
  }

  async function setBrightness(device: any, value: number) {
    updateDevice(device.id, { attributesJson: JSON.stringify({ ...parseAttrs(device.attributesJson), brightness: value }) })
    try {
      await fetch('/api/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, action: 'set_state', params: { brightness: value } }),
      })
    } catch {}
  }

  async function addAlias(device: any) {
    if (!aliasText.trim()) return
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, alias: aliasText.trim(), lang: 'ar' }),
      })
      const data = await res.json()
      if (data.device) {
        updateDevice(device.id, { aliasesJson: data.device.aliasesJson })
        toast.success(`ضفت "${aliasText}" كاسم بديل`)
        setAliasText('')
        setAliasFor(null)
      }
    } catch {
      toast.error('مقدرش أضيف الاسم')
    }
  }

  const filtered = devices.filter(
    (d) =>
      d.friendlyName.toLowerCase().includes(filter.toLowerCase()) ||
      d.room.toLowerCase().includes(filter.toLowerCase()) ||
      d.entityId.toLowerCase().includes(filter.toLowerCase())
  )

  const rooms = [...new Set(filtered.map((d) => d.room))]

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold flex-1">الأجهزة</h3>
          <span className="text-[10px] text-muted-foreground">{devices.length} جهاز</span>
        </div>
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="دوّر على جهاز..."
            className="h-8 text-xs pr-8 rounded-xl bg-input/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {rooms.map((room) => (
          <div key={room}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{room}</p>
            <div className="grid grid-cols-2 gap-2">
              {filtered.filter((d) => d.room === room).map((d) => {
                const attrs = parseAttrs(d.attributesJson)
                const Icon = ICONS[d.icon || ''] || Lightbulb
                const isOn = d.state === 'on' || d.state === 'playing'
                return (
                  <div
                    key={d.id}
                    className={`glass rounded-2xl p-3 transition-all ${
                      isOn ? 'glow-primary border-primary/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        isOn ? 'bg-primary/20 text-primary' : 'bg-muted/40 text-muted-foreground'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <Switch checked={isOn} onCheckedChange={() => toggle(d)} />
                    </div>
                    <p className="text-xs font-medium truncate">{d.friendlyName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{d.entityId}</p>

                    {(d.domain === 'light' || d.domain === 'switch') && isOn && attrs.brightness !== undefined && (
                      <div className="mt-2">
                        <Slider
                          value={[Number(attrs.brightness) || 0]}
                          onValueChange={(v) => setBrightness(d, v[0])}
                          max={100}
                          step={5}
                          className="h-1"
                        />
                      </div>
                    )}

                    <button
                      onClick={() => setAliasFor(aliasFor === d.id ? null : d.id)}
                      className="mt-2 text-[10px] text-primary/70 hover:text-primary flex items-center gap-1"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      اسم بديل
                    </button>

                    {aliasFor === d.id && (
                      <div className="mt-2 flex gap-1">
                        <Input
                          value={aliasText}
                          onChange={(e) => setAliasText(e.target.value)}
                          placeholder="مثلاً: الشاشة"
                          className="h-7 text-xs rounded-lg bg-input/40"
                          dir="rtl"
                        />
                        <Button size="sm" onClick={() => addAlias(d)} className="h-7 px-2 rounded-lg">
                          تم
                        </Button>
                      </div>
                    )}

                    {parseAliases(d.aliasesJson).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {parseAliases(d.aliasesJson).map((a, i) => (
                          <span key={i} className="text-[9px] bg-muted/40 text-muted-foreground rounded-full px-1.5 py-0.5">
                            {a.alias}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function parseAttrs(s: string): Record<string, any> {
  try { return JSON.parse(s || '{}') } catch { return {} }
}
function parseAliases(s: string): { alias: string; lang: string }[] {
  try { return JSON.parse(s || '[]') } catch { return [] }
}
