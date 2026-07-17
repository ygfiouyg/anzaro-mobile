'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { SmartBall } from './SmartBall'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Check, FileText, Sparkles } from 'lucide-react'
import { ONBOARDING_QUESTIONS } from '@/lib/onboarding'

export function OnboardingFlow() {
  const user = useAppStore((s) => s.user)
  const setProfile = useAppStore((s) => s.setProfile)
  const setView = useAppStore((s) => s.setView)
  const setBall = useAppStore((s) => s.setBall)

  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [compiling, setCompiling] = useState(false)
  const [compiledMd, setCompiledMd] = useState<string | null>(null)

  const q = ONBOARDING_QUESTIONS[step]
  const isLast = step === ONBOARDING_QUESTIONS.length - 1
  const progress = ((step + 1) / ONBOARDING_QUESTIONS.length) * 100

  function setAnswer(val: string) {
    setAnswers((a) => ({ ...a, [q.id]: val }))
  }

  function next() {
    if (!answers[q.id]) {
      toast.error('لو سمحت جاوب الأول')
      return
    }
    if (isLast) {
      compile()
    } else {
      setStep((s) => s + 1)
    }
  }

  function back() {
    if (step > 0) setStep((s) => s - 1)
  }

  async function compile() {
    setCompiling(true)
    setBall({ status: 'processing', label: 'بنحلل شخصيتك', labelAr: 'بنحلل شخصيتك' })
    try {
      const name = answers['name'] || user?.name || 'صديقي'
      const age = answers['age'] ? Number(answers['age']) : undefined
      const occupation = answers['occupation']
      const dialectChoice = answers['dialect'] || ''
      const dialect =
        dialectChoice.includes('مصري') || dialectChoice.includes('Egyptian')
          ? 'egyptian'
          : dialectChoice.includes('خليجي') || dialectChoice.includes('Khaleeji')
            ? 'khaleeji'
            : dialectChoice.includes('شامي') || dialectChoice.includes('Levantine')
              ? 'levantine'
              : dialectChoice.includes('فصحى') || dialectChoice.includes('MSA')
                ? 'msa'
                : dialectChoice.includes('English')
                  ? 'english'
                  : 'egyptian'

      const res = await fetch('/api/personality/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, name, age, occupation, dialect }),
      })
      const data = await res.json()
      if (data.profile) {
        setProfile(data.profile)
        setCompiledMd(data.profile.markdown)
        setBall({ status: 'idle', label: 'خلصنا', labelAr: 'خلصنا' })
        toast.success('تمام! جهّزتلك ملف شخصيتك. 🎯')
      } else {
        throw new Error(data.error || 'compile failed')
      }
    } catch (e) {
      toast.error('حصل خطأ في التحليل، جرّب تاني')
      setBall({ status: 'idle', label: 'في انتظارك', labelAr: 'في انتظارك' })
      setCompiling(false)
    }
  }

  function finish() {
    setView('dashboard')
  }

  // Compiled profile preview
  if (compiledMd) {
    return (
      <div className="min-h-screen flex flex-col bg-aurora bg-grid relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/20 blur-[100px]" />
        <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl glass-strong rounded-3xl p-8 glow-primary"
          >
            <div className="flex flex-col items-center mb-6">
              <SmartBall size={100} />
              <h2 className="mt-4 text-2xl font-bold text-gradient">ملفك الشخصي جاهز</h2>
              <p className="text-sm text-muted-foreground">user_personality.md — محفوظ ومرتبط بحسابك</p>
            </div>

            <div className="glass rounded-2xl p-5 max-h-96 overflow-y-auto scrollbar-thin" dir="rtl">
              <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                <FileText className="w-3.5 h-3.5" />
                <span className="font-mono">user_personality.md</span>
              </div>
              <pre className="text-sm leading-relaxed whitespace-pre-wrap font-arabic text-foreground/90">
                {compiledMd}
              </pre>
            </div>

            <Button
              onClick={finish}
              size="lg"
              className="w-full mt-6 h-12 rounded-2xl gap-2"
            >
              <Sparkles className="w-4 h-4" />
              يلا نبدأ — خش للوحة التحكم
            </Button>
          </motion.div>
        </main>
        <footer className="relative z-10 py-6 text-center text-xs text-muted-foreground">
          Anzaro AI · Personality Profile v1
        </footer>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-aurora bg-grid relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/20 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-[100px]" />

      <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-lg">
          {/* Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
              <span>التعرف عليك</span>
              <span>{step + 1} / {ONBOARDING_QUESTIONS.length}</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="glass-strong rounded-3xl p-8 glow-primary"
          >
            {/* Ball + question */}
            <div className="flex flex-col items-center mb-6">
              <SmartBall size={72} showLabel={false} />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-[11px] uppercase tracking-widest text-primary/70 mb-2 text-center">
                  {categoryLabel(q.category)}
                </p>
                <h2 className="text-xl font-semibold text-center leading-relaxed mb-8" dir="rtl">
                  {q.questionAr}
                </h2>

                {/* Input by type */}
                <div className="min-h-[60px] flex items-center justify-center">
                  {q.inputType === 'text' && (
                    <Input
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="اكتب هنا..."
                      className="max-w-sm text-center h-12 rounded-2xl"
                      dir="rtl"
                      autoFocus
                    />
                  )}

                  {q.inputType === 'choice' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm">
                      {(q.optionsAr || q.options || []).map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => setAnswer(opt)}
                          className={`px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                            answers[q.id] === opt
                              ? 'bg-primary text-primary-foreground scale-[1.02] glow-primary'
                              : 'glass hover:bg-accent/50'
                          }`}
                          dir="rtl"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.inputType === 'scale' && (
                    <div className="w-full max-w-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span>خالص</span>
                        <span>نص نص</span>
                        <span>أوي</span>
                      </div>
                      <Slider
                        value={[Number(answers[q.id] || '50')]}
                        onValueChange={(v) => setAnswer(String(v[0]))}
                        max={100}
                        step={5}
                        className="py-2"
                      />
                      <div className="text-center text-2xl font-bold text-primary mt-2">
                        {answers[q.id] || '50'}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Nav */}
            <div className="flex items-center justify-between mt-8">
              <Button
                variant="ghost"
                size="sm"
                onClick={back}
                disabled={step === 0 || compiling}
                className="gap-1"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </Button>

              <Button
                onClick={next}
                disabled={compiling}
                size="sm"
                className="gap-1 rounded-xl"
              >
                {compiling ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    بتحلل...
                  </span>
                ) : isLast ? (
                  <>
                    <Check className="w-4 h-4" />
                    خلّصنا
                  </>
                ) : (
                  <>
                    التالي
                    <ChevronLeft className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-xs text-muted-foreground">
        Anzaro AI · Profiling Agent
      </footer>
    </div>
  )
}

function categoryLabel(c: string): string {
  switch (c) {
    case 'demographic':
      return 'تعارف'
    case 'psychological':
      return 'تحليل نفسي'
    case 'preference':
      return 'تفضيلات'
    case 'driver':
      return 'محفّزات'
    default:
      return c
  }
}
