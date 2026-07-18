'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CloudSun, Sunrise, Sunset, Moon, Clock } from 'lucide-react'

interface WeatherData {
  temperature_2m: number
  relative_humidity_2m: number
  weather_code: number
  wind_speed_10m: number
}

interface PrayerData {
  timings: {
    Fajr: string
    Sunrise: string
    Dhuhr: string
    Asr: string
    Maghrib: string
    Isha: string
  }
  date: string
}

const WEATHER_CODES: Record<number, { ar: string; icon: any }> = {
  0: { ar: 'صحو', icon: CloudSun },
  1: { ar: 'صحو', icon: CloudSun },
  2: { ar: 'غايم جزئي', icon: CloudSun },
  3: { ar: 'غايم', icon: CloudSun },
  45: { ar: 'ضباب', icon: CloudSun },
  51: { ar: 'رذاذ', icon: CloudSun },
  61: { ar: 'مطر', icon: CloudSun },
  71: { ar: 'تلج', icon: CloudSun },
  80: { ar: 'زخات مطر', icon: CloudSun },
  95: { ar: 'عاصفة', icon: CloudSun },
}

export function WeatherPrayerWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [prayer, setPrayer] = useState<PrayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [city, setCity] = useState('Cairo')

  useEffect(() => {
    async function load() {
      try {
        const [wRes, pRes] = await Promise.all([
          fetch('/api/mcp/weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: 30.04, lon: 31.24, name: 'Cairo' }),
          }),
          fetch('/api/mcp/prayer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city: 'Cairo', country: 'Egypt' }),
          }),
        ])
        const w = await wRes.json()
        const p = await pRes.json()
        if (w.current) setWeather(w.current)
        if (p.timings) setPrayer(p)
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const nextPrayer = useNextPrayer(prayer?.timings)
  const wCode = weather ? WEATHER_CODES[weather.weather_code] || WEATHER_CODES[0] : null
  const WIcon = wCode?.icon || CloudSun

  return (
    <div className="glass-strong rounded-2xl p-3 flex items-center gap-3">
      {/* Weather */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <WIcon className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          {loading ? (
            <div className="space-y-1">
              <div className="h-3 w-12 shimmer rounded" />
              <div className="h-2 w-10 shimmer rounded" />
            </div>
          ) : weather ? (
            <>
              <p className="text-sm font-bold leading-tight">{Math.round(weather.temperature_2m)}°C</p>
              <p className="text-[9px] text-muted-foreground leading-tight">{wCode?.ar} · {city}</p>
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground">N/A</p>
          )}
        </div>
      </div>

      <div className="w-px h-8 bg-border/40" />

      {/* Prayer */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {nextPrayer ? (
          <>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <nextPrayer.icon className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium leading-tight truncate">{nextPrayer.label}</p>
              <p className="text-[9px] text-muted-foreground leading-tight flex items-center gap-1">
                <Clock className="w-2 h-2" />
                {nextPrayer.time} · {nextPrayer.in}
              </p>
            </div>
          </>
        ) : (
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">مواعيد الصلاة</p>
            <p className="text-[9px] text-muted-foreground/70">جارٍ التحميل...</p>
          </div>
        )}
      </div>
    </div>
  )
}

function useNextPrayer(timings?: PrayerData['timings']) {
  const [next, setNext] = useState<{ label: string; time: string; in: string; icon: any } | null>(null)

  useEffect(() => {
    if (!timings) return
    const compute = () => {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const prayers = [
        { key: 'Fajr', label: 'الفجر', time: timings.Fajr, icon: Sunrise },
        { key: 'Dhuhr', label: 'الظهر', time: timings.Dhuhr, icon: CloudSun },
        { key: 'Asr', label: 'العصر', time: timings.Asr, icon: CloudSun },
        { key: 'Maghrib', label: 'المغرب', time: timings.Maghrib, icon: Sunset },
        { key: 'Isha', label: 'العشاء', time: timings.Isha, icon: Moon },
      ]
      for (const p of prayers) {
        const [h, m] = p.time.split(':').map(Number)
        const pMin = h * 60 + m
        if (pMin > nowMin) {
          const diff = pMin - nowMin
          const inStr = diff < 60 ? `${diff} د` : `${Math.floor(diff / 60)} س ${diff % 60} د`
          return { label: p.label, time: p.time, in: `بعد ${inStr}`, icon: p.icon }
        }
      }
      return { label: 'الفجر', time: timings.Fajr, in: 'بكرة', icon: Sunrise }
    }
    const result = compute()
    const timer = setTimeout(() => {
      setNext(result)
    }, 0)
    const interval = setInterval(() => {
      const r = compute()
      Promise.resolve(r).then((v) => setNext(v))
    }, 60000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [timings])

  return next
}
