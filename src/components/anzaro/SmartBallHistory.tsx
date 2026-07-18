'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { authFetch } from '@/lib/auth-fetch'
import { motion } from 'framer-motion'
import { Radio, Lightbulb, Clapperboard, Zap, Clock, Bot, User } from 'lucide-react'

interface HistoryItem {
  id: string
  role: string
  content: string
  intent: string | null
  createdAt: string
}

const INTENT_ICONS: Record<string, any> = {
  media: Radio,
  device: Lightbulb,
  scene: Clapperboard,
  chat: Bot,
}

const INTENT_COLORS: Record<string, string> = {
  media: 'bg-emerald-500/15 text-emerald-400',
  device: 'bg-amber-500/15 text-amber-400',
  scene: 'bg-violet-500/15 text-violet-400',
  chat: 'bg-blue-500/15 text-blue-400',
}

export function SmartBallHistory() {
  const token = useAuthStore((s) => s.token)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Fetch recent messages from conversations
        const res = await authFetch('/api/anzaro/conversations')
        const data = await res.json()
        const convs = data.conversations || []
        if (convs.length > 0) {
          // Load messages from the most recent conversation
          const msgRes = await authFetch(`/api/anzaro/conversations/list-messages?id=${convs[0].id}`)
          const msgData = await msgRes.json()
          if (msgData.messages) {
            setItems(msgData.messages.slice(-15).reverse()) // Last 15, newest first
          }
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [token])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          سجل النشاط
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">آخر الأوامر والردود</p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-xl p-3 shimmer h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">مفيش نشاط لسه</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">ابدأ محادثة وهيظهر هنا</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute right-4 top-0 bottom-0 w-px bg-border/40" />
            <div className="space-y-2">
              {items.map((item, i) => {
                const isUser = item.role === 'user'
                const IntentIcon = item.intent ? INTENT_ICONS[item.intent] || Bot : (isUser ? User : Bot)
                const colorClass = item.intent ? INTENT_COLORS[item.intent] || INTENT_COLORS.chat : 'bg-muted/30 text-muted-foreground'
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex gap-2.5 relative"
                  >
                    {/* Timeline dot */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border-2 border-background ${colorClass}`}>
                      <IntentIcon className="w-3 h-3" />
                    </div>
                    {/* Content */}
                    <div className={`flex-1 min-w-0 pb-2`}>
                      <div className={`glass rounded-xl p-2.5 ${isUser ? 'border-primary/20' : ''}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-medium text-muted-foreground">
                            {isUser ? 'أنت' : 'Anzaro'}
                          </span>
                          {item.intent && (
                            <span className={`text-[8px] px-1 py-0.5 rounded-full ${colorClass}`}>
                              {item.intent}
                            </span>
                          )}
                          <span className="text-[8px] text-muted-foreground/60 ml-auto">
                            {new Date(item.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-foreground/80 line-clamp-2 leading-relaxed" dir="rtl">
                          {item.content.replace(/[▶⏹⏸💡🔌🎭🎵✅❌🎯]/g, '').replace(/\*\*/g, '').trim().slice(0, 120)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
