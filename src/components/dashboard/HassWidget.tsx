'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/auth-store'
import { authFetch } from '@/lib/auth-fetch'
import {
  Lightbulb, Switch, Thermometer, Tv, Gauge, Wind, Power,
  RefreshCw, Loader2, AlertCircle, Sparkles, CheckCircle2,
} from 'lucide-react'

// ─── Types ───
interface HassDevice {
  entity_id: string
  friendly_name: string
  domain: string
  state: string
  attributes: Record<string, any>
}

interface HassConfig {
  isConfigured: boolean
  url: string | null
}

interface MatrixSuggestion {
  entity_id: string
  service: string
  service_data: Record<string, unknown>
  reason: string
  reasonAr: string
  priority: 'high' | 'medium' | 'low'
}

// ─── Domain Icons & Colors ───
const DOMAIN_ICONS: Record<string, any> = {
  light: Lightbulb,
  switch: Switch,
  climate: Wind,
  sensor: Gauge,
  media_player: Tv,
  cover: Thermometer,
  fan: Wind,
}

const DOMAIN_COLORS: Record<string, { on: string; off: string }> = {
  light: { on: 'bg-amber-500/20 text-amber-400', off: 'bg-muted/30 text-muted-foreground' },
  switch: { on: 'bg-blue-500/20 text-blue-400', off: 'bg-muted/30 text-muted-foreground' },
  climate: { on: 'bg-cyan-500/20 text-cyan-400', off: 'bg-muted/30 text-muted-foreground' },
  sensor: { on: 'bg-emerald-500/20 text-emerald-400', off: 'bg-muted/30 text-muted-foreground' },
  media_player: { on: 'bg-violet-500/20 text-violet-400', off: 'bg-muted/30 text-muted-foreground' },
  cover: { on: 'bg-teal-500/20 text-teal-400', off: 'bg-muted/30 text-muted-foreground' },
  fan: { on: 'bg-orange-500/20 text-orange-400', off: 'bg-muted/30 text-muted-foreground' },
}

export function HassWidget({ matrix }: { matrix?: any }) {
  const token = useAuthStore((s) => s.token)
  const [devices, setDevices] = useState<HassDevice[]>([])
  const [config, setConfig] = useState<HassConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<MatrixSuggestion[]>([])

  // ─── Fetch devices ───
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/anzaro/hass')
      const data = await res.json()
      if (data.entities) setDevices(data.entities)
      if (data.config) setConfig(data.config)
    } catch {
      // V.14: Silent fail — keep existing data
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // ─── Fetch matrix-based suggestions ───
  useEffect(() => {
    if (!matrix) return
    async function fetchSuggestions() {
      try {
        const res = await authFetch('/api/anzaro/hass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_suggestions', matrix }),
        })
        const data = await res.json()
        if (data.suggestions) setSuggestions(data.suggestions)
      } catch {}
    }
    fetchSuggestions()
  }, [matrix])

  // ─── Toggle device ───
  const toggleDevice = async (entityId: string, currentState: string) => {
    setToggling(entityId)
    const action = currentState === 'on' ? 'turn_off' : 'turn_on'

    // V.14: Optimistic update
    setDevices((prev) =>
      prev.map((d) => (d.entity_id === entityId ? { ...d, state: action === 'turn_on' ? 'on' : 'off' } : d))
    )

    try {
      const res = await authFetch('/api/anzaro/hass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, entityId }),
      })
      const data = await res.json()
      if (!data.success) {
        // Revert optimistic update
        setDevices((prev) =>
          prev.map((d) => (d.entity_id === entityId ? { ...d, state: currentState } : d))
        )
      }
    } catch {
      // Revert on error
      setDevices((prev) =>
        prev.map((d) => (d.entity_id === entityId ? { ...d, state: currentState } : d))
      )
    }
    setToggling(null)
  }

  // ─── Apply a matrix suggestion ───
  const applySuggestion = async (suggestion: MatrixSuggestion) => {
    setToggling(suggestion.entity_id)
    try {
      await authFetch('/api/anzaro/hass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_state',
          entityId: suggestion.entity_id,
          service: suggestion.service,
          serviceData: suggestion.service_data,
        }),
      })
      // Refresh to get updated states
      await refresh()
    } catch {}
    setToggling(null)
  }

  // ─── Group devices by domain ───
  const domains = [...new Set(devices.map((d) => d.domain))]
  const controllableDomains = ['light', 'switch', 'climate', 'media_player', 'cover', 'fan']
  const sensorDomains = ['sensor']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <HomeIcon />
            Smart Home Hub
          </h3>
          <button
            onClick={refresh}
            disabled={loading}
            className="w-6 h-6 rounded-lg hover:bg-accent/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="تحديث"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {config?.isConfigured ? (
            <span className="text-[10px] flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              HASS متصل · {config.url?.replace(/^https?:\/\//, '').split('/')[0]}
            </span>
          ) : (
            <span className="text-[10px] flex items-center gap-1 text-amber-400">
              <AlertCircle className="w-3 h-3" />
              وضع تجريبي (Mock) — اضبط HASS_URL و HASS_TOKEN
            </span>
          )}
        </div>
      </div>

      {/* Matrix Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-3 py-2 border-b border-border/40 bg-primary/5">
          <p className="text-[10px] uppercase tracking-widest text-primary/70 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            اقتراحات حسب شخصيتك
          </p>
          <div className="space-y-1.5">
            <AnimatePresence>
              {suggestions.slice(0, 3).map((s, i) => (
                <motion.div
                  key={s.entity_id + i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-2 p-2 rounded-lg glass smart-ball-card"
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                    s.priority === 'high' ? 'bg-red-500/15 text-red-400' :
                    s.priority === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                    'bg-emerald-500/15 text-emerald-400'
                  }`}>
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{s.reasonAr}</p>
                    <p className="text-[9px] text-muted-foreground font-mono truncate">{s.entity_id}</p>
                  </div>
                  <button
                    onClick={() => applySuggestion(s)}
                    disabled={toggling === s.entity_id}
                    className="px-2 py-1 rounded-lg bg-primary/15 text-primary text-[10px] font-medium hover:bg-primary/25 transition-colors btn-press"
                  >
                    {toggling === s.entity_id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'تطبيق'}
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Devices */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
        {loading && devices.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-xl p-3 shimmer h-14" />
            ))}
          </div>
        ) : (
          <>
            {/* Controllable devices */}
            {domains.filter((d) => controllableDomains.includes(d)).map((domain) => {
              const domainDevices = devices.filter((d) => d.domain === domain)
              if (domainDevices.length === 0) return null
              return (
                <div key={domain}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-3 rounded-full bg-primary/40" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{domain}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {domainDevices.map((device, i) => {
                      const Icon = DOMAIN_ICONS[device.domain] || Power
                      const colors = DOMAIN_COLORS[device.domain] || DOMAIN_COLORS.switch
                      const isOn = device.state === 'on' || device.state === 'playing'
                      const isToggling = toggling === device.entity_id
                      return (
                        <motion.div
                          key={device.entity_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`glass rounded-xl p-3 smart-ball-card transition-all ${
                            isOn ? 'glow-primary border-primary/30' : 'hover:border-border/60'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-1.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isOn ? colors.on : colors.off}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <button
                              onClick={() => toggleDevice(device.entity_id, device.state)}
                              disabled={isToggling}
                              className={`relative w-9 h-5 rounded-full transition-colors btn-press ${
                                isOn ? 'bg-primary' : 'bg-muted'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                  isOn ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                              {isToggling && (
                                <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-white" />
                              )}
                            </button>
                          </div>
                          <p className="text-[11px] font-medium truncate">{device.friendly_name}</p>
                          <p className="text-[9px] text-muted-foreground font-mono truncate">{device.entity_id}</p>
                          {/* Sensor value */}
                          {device.domain === 'sensor' && (
                            <p className="text-sm font-bold text-primary mt-0.5">
                              {device.state}
                              <span className="text-[9px] text-muted-foreground ml-1">
                                {device.attributes?.unit_of_measurement || ''}
                              </span>
                            </p>
                          )}
                          {/* Brightness for lights */}
                          {device.domain === 'light' && isOn && device.attributes?.brightness != null && (
                            <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.round((device.attributes.brightness / 255) * 100)}%` }}
                              />
                            </div>
                          )}
                          {/* Temperature for climate */}
                          {device.domain === 'climate' && isOn && device.attributes?.temperature != null && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {device.attributes.temperature}°C · {device.attributes.fan_mode || 'auto'}
                            </p>
                          )}
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Sensors (read-only) */}
            {domains.filter((d) => sensorDomains.includes(d)).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-3 rounded-full bg-emerald-500/40" />
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">sensors</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {devices.filter((d) => d.domain === 'sensor').map((device, i) => (
                    <motion.div
                      key={device.entity_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="glass rounded-xl p-3 flex items-center gap-2"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{device.friendly_name}</p>
                        <p className="text-sm font-bold text-primary">
                          {device.state}
                          <span className="text-[9px] text-muted-foreground ml-1">
                            {device.attributes?.unit_of_measurement || ''}
                          </span>
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Home Icon ───
function HomeIcon() {
  return (
    <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
