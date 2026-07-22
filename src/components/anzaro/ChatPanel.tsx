'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { SmartBall } from './SmartBall'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useVoiceInput } from '@/hooks/use-voice-input'
import {
  Send,
  Sparkles,
  Radio,
  Lightbulb,
  Clapperboard,
  Zap,
  Brain,
  Wind,
  Tv,
  Moon,
  Briefcase,
  Video,
  Bot,
  Mic,
  MicOff,
  User as UserIcon,
} from 'lucide-react'

const ICONS: Record<string, any> = {
  Radio, Lightbulb, Clapperboard, Zap, Brain, Wind, Tv, Moon, Briefcase, Video,
}

const SUGGESTIONS = [
  { icon: Radio, text: 'شغّل قرآن من القاهرة', color: 'text-emerald-400' },
  { icon: Zap, text: 'اقفل الراديو', color: 'text-amber-400' },
  { icon: Tv, text: 'ولّع الشاشة', color: 'text-violet-400' },
  { icon: Brain, text: 'نفّس وضع التركيز', color: 'text-blue-400' },
  { icon: Briefcase, text: 'أنا هبدأ شغل، جهّز المكتب', color: 'text-rose-400' },
  { icon: Moon, text: 'تصبح على خير، اقفل كل حاجة', color: 'text-indigo-400' },
]

export function ChatPanel() {
  const { messages, addMessage, updateLastMessage, user, profile, ball, setBall, conversationId, setConversationId, setMediaSession, mediaSession, refreshMedia, refreshDevices } = useChatActions()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Voice input (Web Speech API STT)
  const voice = useVoiceInput({
    lang: 'ar-EG',
    onResult: (text) => {
      setInput((prev) => (prev ? prev + ' ' + text : text))
      setBall({ status: 'processing', label: 'بفكّر', labelAr: 'بفكّر' })
    },
    onStateChange: (listening) => {
      if (listening) {
        setBall({ status: 'listening', label: 'بسمعك', labelAr: 'بسمعك' })
      } else if (ball.status === 'listening') {
        setBall({ status: 'idle', label: 'في انتظارك', labelAr: 'في انتظارك' })
      }
    },
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, voice.interim])

  // Listen for quick-action / external command injections
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string
      if (detail) send(detail)
    }
    window.addEventListener('anzaro-inject-input', handler)
    return () => window.removeEventListener('anzaro-inject-input', handler)
  }, [sending, conversationId])

  async function send(text?: string) {
    const message = (text ?? input).trim()
    if (!message || sending) return

    setInput('')
    setSending(true)
    addMessage({ role: 'user', content: message })
    setBall({ status: 'listening', label: 'بسمعك', labelAr: 'بسمعك' })

    // Add a pending assistant message
    addMessage({ role: 'assistant', content: '', pending: true })

    setTimeout(() => setBall({ status: 'processing', label: 'بفكّر', labelAr: 'بفكّر' }), 250)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId }),
      })
      const data = await res.json()

      if (data.reply) {
        setBall({ status: 'executing', label: 'بينفّذ', labelAr: 'بينفّذ' })
        // If actions ran, refresh media + devices
        if (data.actions?.length) {
          await refreshMedia()
          await refreshDevices()
        }
        updateLastMessage({
          content: data.reply,
          pending: false,
          intent: data.intent?.type,
          actions: data.actions,
        })
        if (data.conversationId) setConversationId(data.conversationId)

        setTimeout(() => {
          setBall({ status: 'speaking', label: 'بتكلم', labelAr: 'بتكلم' })
          setTimeout(() => setBall({ status: 'idle', label: 'في انتظارك', labelAr: 'في انتظارك' }), 1200)
        }, 400)
      } else {
        updateLastMessage({ content: 'مقدرش أرد دلوقتي، جرّب تاني.', pending: false })
        setBall({ status: 'idle', label: 'في انتظارك', labelAr: 'في انتظارك' })
      }
    } catch (e) {
      updateLastMessage({ content: 'حصل خطأ في الاتصال.', pending: false })
      setBall({ status: 'error', label: 'في مشكلة', labelAr: 'في مشكلة' })
      setTimeout(() => setBall({ status: 'idle', label: 'في انتظارك', labelAr: 'في انتظارك' }), 1500)
      toast.error('فشل الإرسال')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full glass-strong rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
          </div>
          <span className="text-sm font-medium">Anzaro</span>
          <Badge variant="secondary" className="text-[10px] h-5 gap-1">
            <Bot className="w-3 h-3" />
            {profile?.personaType ?? 'balanced'}
          </Badge>
        </div>
        {mediaSession?.status === 'playing' && (
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
            <Radio className="w-3 h-3 animate-pulse" />
            {mediaSession.title}
          </Badge>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-5" ref={scrollRef as any}>
        <div className="py-5 space-y-4 min-h-full">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <SmartBall size={120} />
              <h3 className="mt-6 text-lg font-semibold">
                أهلاً {profile?.name || user?.name || 'يا صاحبي'} 👋
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                أنا آنزارو. قولي أي حاجة — هترتب لك كل حاجة.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 w-full max-w-md">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s.text)}
                    className="glass rounded-2xl px-3 py-2.5 text-right text-sm hover:bg-accent/40 transition-all flex items-center gap-2 group"
                  >
                    <s.icon className={`w-4 h-4 ${s.color} group-hover:scale-110 transition-transform`} />
                    <span className="flex-1">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                m.role === 'user' ? 'bg-secondary' : 'bg-primary/15'
              }`}>
                {m.role === 'user' ? (
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Bot className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className={`max-w-[80%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'glass rounded-tl-sm'
                }`}>
                  {m.pending ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  ) : (
                    m.content
                  )}
                </div>
                {m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.actions.map((a: any, j: number) => (
                      <ActionBadge key={j} action={a} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-5 py-4 border-t border-border/40">
        {/* Voice listening indicator */}
        <AnimatePresence>
          {voice.listening && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20"
            >
              <div className="flex items-end gap-0.5 h-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-0.5 bg-primary rounded-full animate-pulse"
                    style={{
                      height: `${30 + Math.random() * 70}%`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: '600ms',
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-primary font-medium">بسمعك...</span>
              {voice.interim && (
                <span className="text-xs text-muted-foreground truncate flex-1" dir="rtl">{voice.interim}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={voice.listening ? 'بسمعك... اتكلم' : 'اكتب لـ Anzaro... (مثلاً: شغّل قرآن، اقفل النور، نفّس وضع السينما)'}
            className="resize-none min-h-[48px] max-h-32 rounded-2xl bg-input/50 border-border/40"
            dir="rtl"
            rows={1}
          />
          {voice.supported && (
            <Button
              onClick={voice.toggle}
              variant={voice.listening ? 'default' : 'ghost'}
              size="icon"
              className={`rounded-2xl h-12 w-12 shrink-0 transition-all ${
                voice.listening ? 'bg-primary text-primary-foreground glow-primary animate-pulse' : 'glass hover:bg-accent/50'
              }`}
              title={voice.listening ? 'وقف التسجيل' : 'اتكلم لـ Anzaro'}
            >
              {voice.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}
          <Button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            size="icon"
            className="rounded-2xl h-12 w-12 shrink-0 glow-primary"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function ActionBadge({ action }: { action: any }) {
  const iconKey =
    action.kind === 'media_play' ? 'Radio'
    : action.kind === 'scene_execute' ? 'Clapperboard'
    : action.kind === 'device_control' ? 'Lightbulb'
    : 'Zap'
  const Icon = ICONS[iconKey] || Zap
  const label =
    action.kind === 'media_play' ? `▶ ${action.station}`
    : action.kind === 'media_stop' ? '⏹ إيقاف'
    : action.kind === 'media_pause' ? '⏸ إيقاف مؤقت'
    : action.kind === 'media_resume' ? '▶ استئناف'
    : action.kind === 'scene_execute' ? `🎭 ${action.name}`
    : action.kind === 'device_control' ? `⚡ ${action.alias}`
    : '⚡ تنفيذ'
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

// Hook to centralize store actions + data refresh helpers
function useChatActions() {
  const store = useAppStore()
  const refreshMedia = async () => {
    try {
      const res = await fetch('/api/media/session')
      const data = await res.json()
      store.setMediaSession(data.session)
    } catch {}
  }
  const refreshDevices = async () => {
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      store.setDevices(data.devices || [])
    } catch {}
  }
  useEffect(() => {
    refreshMedia()
  }, [])
  return { ...store, refreshMedia, refreshDevices }
}
