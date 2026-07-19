'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'
import { useSmartBallStore } from "@/lib/smart-ball-store"
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Plus, MessageSquare, Trash2, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConvItem {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  lastMessage: string
  lastRole: string | null
}

export function ConversationSidebar({ onClose }: { onClose?: () => void }) {
  const { conversationId, setConversationId, clearMessages, addMessage, setBall } = useSmartBallStore()
  const [items, setItems] = useState<ConvItem[]>([])
  const [loading, setLoading] = useState(false)

  async function refresh() {
    try {
      const res = await authFetch('/api/anzaro/conversations')
      const data = await res.json()
      setItems(data.conversations || [])
    } catch {}
  }

  useEffect(() => {
    refresh()
  }, [])

  async function newConversation() {
    clearMessages()
    setConversationId('')
    onClose?.()
  }

  async function loadConversation(id: string) {
    if (id === conversationId) {
      onClose?.()
      return
    }
    setLoading(true)
    try {
      const res = await authFetch(`/api/anzaro/conversations/list-messages?id=${id}`)
      const data = await res.json()
      if (data.messages) {
        clearMessages()
        setConversationId(id)
        for (const m of data.messages) {
          addMessage({
            id: m.id,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
            intent: m.intent || undefined,
            actions: m.actions || [],
          })
        }
      }
      onClose?.()
    } catch {
      toast.error('مقدرش أحمل المحادثة دي')
    } finally {
      setLoading(false)
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const res = await fetch('/api/anzaro/conversations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        toast.error('فشل مسح المحادثة')
        return
      }
      if (id === conversationId) {
        clearMessages()
        setConversationId('')
      }
      refresh()
      toast.success('اتمسحت المحادثة')
    } catch {
      toast.error('خطأ في الاتصال')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          المحادثات
        </h3>
        <Button size="sm" variant="ghost" onClick={newConversation} className="h-7 gap-1 text-xs rounded-lg">
          <Plus className="w-3 h-3" />
          جديد
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 py-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
            <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center mb-3">
              <MessageSquare className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">مفيش محادثات لسه</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">ابدأ محادثة جديدة وهتظهر هنا</p>
          </div>
        ) : (
          <div className="space-y-1">
            <AnimatePresence>
              {items.map((c) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onClick={() => loadConversation(c.id)}
                  disabled={loading}
                  className={`w-full text-right p-2.5 rounded-xl transition-all group ${
                    c.id === conversationId
                      ? 'bg-primary/15 border border-primary/30'
                      : 'glass hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      c.id === conversationId ? 'bg-primary/20 text-primary' : 'bg-muted/40 text-muted-foreground'
                    }`}>
                      <MessageSquare className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{c.title}</p>
                      {c.lastMessage && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5" dir="rtl">
                          {c.lastRole === 'user' ? 'أنت: ' : 'Anzaro: '}{c.lastMessage}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-muted-foreground/70 flex items-center gap-0.5">
                          <Clock className="w-2 h-2" />
                          {timeAgo(c.updatedAt)}
                        </span>
                        <span className="text-[9px] text-muted-foreground/70">{c.messageCount} رسالة</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(c.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'دلوقتي'
  if (mins < 60) return `${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} س`
  const days = Math.floor(hours / 24)
  return `${days} ي`
}
