'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { motion } from 'framer-motion'
import { Cpu, CheckCircle2, XCircle, AlertTriangle, Activity, Zap } from 'lucide-react'

interface ProviderInfo {
  configured: boolean
  keyName: string
  modelCount: number
}

interface ModelData {
  providers: Record<string, ProviderInfo>
  summary: {
    totalModels: number
    totalProviders: number
    configuredProviders: number
    health: string
  }
}

const PROVIDER_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  zai: { label: 'Z.AI (GLM)', icon: '🧠', color: 'violet' },
  zhipuai: { label: 'ZhipuAI', icon: '🔮', color: 'blue' },
  openai: { label: 'OpenAI (GPT-4o)', icon: '🤖', color: 'emerald' },
  anthropic: { label: 'Anthropic (Claude)', icon: '🎭', color: 'amber' },
  gemini: { label: 'Google Gemini', icon: '✨', color: 'rose' },
  groq: { label: 'Groq (Llama)', icon: '⚡', color: 'orange' },
  cerebras: { label: 'Cerebras', icon: '🚀', color: 'cyan' },
  openrouter: { label: 'OpenRouter', icon: '🌐', color: 'teal' },
  huggingface: { label: 'HuggingFace', icon: '🤗', color: 'yellow' },
  github: { label: 'GitHub Models', icon: '🐙', color: 'slate' },
  pollinations: { label: 'Pollinations', icon: '🌸', color: 'pink' },
  cloudflare: { label: 'Cloudflare AI', icon: '☁️', color: 'sky' },
}

export function ModelProviderDashboard() {
  const token = useAuthStore((s) => s.token)
  const [data, setData] = useState<ModelData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/anzaro/models', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const d = await res.json()
        if (d.providers) setData(d)
      } catch {}
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-xl p-3 shimmer h-16" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <AlertTriangle className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground">مقدرش أحمل بيانات المزودين</p>
      </div>
    )
  }

  const { summary } = data
  const providerEntries = Object.entries(data.providers).sort((a, b) => {
    if (a[1].configured && !b[1].configured) return -1
    if (!a[1].configured && b[1].configured) return 1
    return 0
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          مزودو النماذج
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">Centralized Model Registry</p>
        <div className={`mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${
          summary.health === 'healthy'
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-red-500/15 text-red-400'
        }`}>
          {summary.health === 'healthy' ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          {summary.configuredProviders}/{summary.totalProviders} مزود جاهز · {summary.totalModels} نموذج
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {providerEntries.map(([providerId, info], i) => {
          const meta = PROVIDER_LABELS[providerId] || { label: providerId, icon: '🔧', color: 'slate' }
          return (
            <motion.div
              key={providerId}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all smart-ball-card ${
                info.configured
                  ? 'glass border-emerald-500/20'
                  : 'bg-muted/20 border-border/40'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${
                info.configured ? 'bg-emerald-500/10' : 'bg-muted/30'
              }`}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{meta.label}</p>
                <p className="text-[9px] text-muted-foreground font-mono truncate">{info.keyName}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {info.configured ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-muted-foreground/50" />
                )}
                {info.modelCount > 0 && (
                  <span className="text-[9px] text-muted-foreground">{info.modelCount} نموذج</span>
                )}
              </div>
            </motion.div>
          )
        })}
        {providerEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">مفيش مزودين مسجلين</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">ضيف مفاتيح API في إعدادات الـ Space</p>
          </div>
        )}
      </div>
    </div>
  )
}
