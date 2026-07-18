'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Wrench, Search, Database, Home, Zap, CheckCircle2, Cloud, Cpu,
} from 'lucide-react'

const CATEGORY_ICONS: Record<string, any> = {
  search: Search,
  data: Database,
  home: Home,
  media: Zap,
  utility: Wrench,
}

interface Tool {
  id: string
  name: string
  description: string
  category: string
  endpoint: string | null
  isLocal: boolean
  latencyMs: number
  isEnabled: boolean
}

export function McpToolsPanel() {
  const [tools, setTools] = useState<Tool[]>([])
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/anzaro/mcp/tools')
      .then((r) => r.json())
      .then((d) => setTools(d.tools || []))
      .catch(() => {})
  }, [])

  async function testTool(tool: Tool) {
    setTesting(tool.id)
    try {
      let res: Response
      if (tool.name === 'prayer_times') {
        res = await fetch('/api/anzaro/mcp/prayer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: 'Cairo', country: 'Egypt' }),
        })
      } else if (tool.name === 'weather') {
        res = await fetch('/api/anzaro/mcp/weather', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: 30.04, lon: 31.24, name: 'Cairo' }),
        })
      } else if (tool.name === 'web_search') {
        res = await fetch('/api/anzaro/mcp/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'latest AI news' }),
        })
      } else {
        toast.info('الأداة دي بتشتغل عبر الشات مباشرة')
        setTesting(null)
        return
      }
      const data = await res.json()
      if (data.timings) {
        toast.success(`مواعيد الصلاة في القاهرة — الفجر: ${data.timings.Fajr}, الظهر: ${data.timings.Dhuhr}`)
      } else if (data.current) {
        toast.success(`الجو في ${data.name}: ${data.current.temperature_2m}°C، رطوبة ${data.current.relative_humidity_2m}%`)
      } else if (data.result) {
        toast.success(data.result.slice(0, 100) + '...')
      } else {
        toast.info('الأداة اشتغلت')
      }
    } catch {
      toast.error('مقدرش أشغّل الأداة دي')
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          أدوات MCP
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Phase 1 — الأدوات متاحة للشات مباشرة
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
        {tools.map((t) => {
          const Icon = CATEGORY_ICONS[t.category] || Zap
          return (
            <div key={t.id} className="glass rounded-2xl p-3">
              <div className="flex items-start gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  t.isLocal ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-mono font-medium truncate">{t.name}</p>
                    {t.isLocal ? (
                      <Badge className="text-[9px] h-4 px-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/20 gap-0.5">
                        <Cpu className="w-2 h-2" /> محلي
                      </Badge>
                    ) : (
                      <Badge className="text-[9px] h-4 px-1 bg-blue-500/15 text-blue-400 border-blue-500/20 gap-0.5">
                        <Cloud className="w-2 h-2" /> سحابي
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] text-muted-foreground">{t.latencyMs}ms</span>
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => testTool(t)}
                disabled={testing === t.id}
                className="w-full mt-2 h-7 text-[11px] rounded-lg"
              >
                {testing === t.id ? 'بيقيس...' : 'جرّب'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
