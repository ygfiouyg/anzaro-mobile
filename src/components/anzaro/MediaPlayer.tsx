'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { Radio, Play, Pause, Square, Volume2, Loader2 } from 'lucide-react'

interface Station {
  id: string
  name: string
  nameAr: string
  category: string
  city: string | null
  streamUrl: string
  description: string | null
}

export function MediaPlayer() {
  const { mediaSession, setMediaSession } = useAppStore()
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/media/stations')
      .then((r) => r.json())
      .then((d) => setStations(d.stations || []))
      .catch(() => {})
    refreshSession()
  }, [])

  async function refreshSession() {
    try {
      const res = await fetch('/api/media/session')
      const data = await res.json()
      setMediaSession(data.session)
    } catch {}
  }

  async function play(station: Station) {
    setLoading(true)
    try {
      await fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'play', stationId: station.id }),
      })
      await refreshSession()
      toast.success(`شغّلت ${station.nameAr}`)
    } catch {
      toast.error('مقدرش أشغّل المحطة دي')
    } finally {
      setLoading(false)
    }
  }

  async function control(action: 'pause' | 'resume' | 'stop') {
    setLoading(true)
    try {
      await fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      await refreshSession()
    } catch {
      toast.error('مقدرش أتحكم')
    } finally {
      setLoading(false)
    }
  }

  async function setVolume(v: number) {
    try {
      await fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'volume', volume: v }),
      })
      if (mediaSession) setMediaSession({ ...mediaSession, volume: v })
    } catch {}
  }

  const isPlaying = mediaSession?.status === 'playing'

  return (
    <div className="glass-strong rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold flex-1">المشغل</h3>
        {mediaSession && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            isPlaying ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
          }`}>
            {mediaSession.status === 'playing' ? 'يعمل' : mediaSession.status === 'paused' ? 'موقف' : 'مقفول'}
          </span>
        )}
      </div>

      {/* Now playing */}
      {mediaSession ? (
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              isPlaying ? 'bg-primary/20 text-primary animate-pulse' : 'bg-muted/40 text-muted-foreground'
            }`}>
              <Radio className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{mediaSession.title}</p>
              <p className="text-[10px] text-muted-foreground truncate">{mediaSession.source}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9"
              onClick={() => control(mediaSession.status === 'paused' ? 'resume' : 'pause')}
              disabled={loading || mediaSession.status === 'stopped'}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9 text-destructive hover:text-destructive"
              onClick={() => control('stop')}
              disabled={loading || mediaSession.status === 'stopped'}
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 mt-3">
            <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
            <Slider
              value={[mediaSession.volume]}
              onValueChange={(v) => setVolume(v[0])}
              max={100}
              step={5}
              className="h-1 flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-7">{mediaSession.volume}</span>
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl p-4 mb-4 text-center">
          <p className="text-xs text-muted-foreground">مفيش حاجة شغّالة دلوقتي</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">اختار محطة من تحت أو قول لآنزارو يشغّل</p>
        </div>
      )}

      {/* Stations */}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">المحطات</p>
      <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto scrollbar-thin">
        {stations.map((s) => (
          <button
            key={s.id}
            onClick={() => play(s)}
            disabled={loading}
            className={`flex items-center gap-2 p-2 rounded-xl text-right transition-all ${
              mediaSession?.stationId === s.id
                ? 'bg-primary/15 border border-primary/30'
                : 'glass hover:bg-accent/40'
            }`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              s.category === 'quran' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-primary/10 text-primary'
            }`}>
              <Radio className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{s.nameAr}</p>
              <p className="text-[9px] text-muted-foreground truncate">{s.city || s.country} · {s.category}</p>
            </div>
            {mediaSession?.stationId === s.id && isPlaying && (
              <div className="flex items-end gap-0.5 h-3">
                <span className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                <span className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '100%', animationDelay: '100ms' }} />
                <span className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '40%', animationDelay: '200ms' }} />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
