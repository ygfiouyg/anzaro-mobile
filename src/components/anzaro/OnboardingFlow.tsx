'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { authFetch } from '@/lib/auth-fetch';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Brain,
  Heart,
  Target,
  CheckCircle2,
  Circle,
} from 'lucide-react';

interface OnboardingQuestion {
  id: string;
  question: string;
  questionAr?: string;
  category: string;
  inputType: 'text' | 'choice' | 'scale';
  options?: string[];
  optionsAr?: string[];
  traitKey?: string;
}

interface OnboardingFlowProps {
  onComplete: () => void;
}

const categoryMeta: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  demographic: { icon: Target, label: 'تعريفي', color: 'text-sky-400' },
  psychological: { icon: Brain, label: 'نفسي', color: 'text-violet-400' },
  preference: { icon: Heart, label: 'تفضيلات', color: 'text-rose-400' },
  driver: { icon: Sparkles, label: 'محفزات', color: 'text-amber-400' },
};

// V.17: Per-question scale labels extracted from questionAr
// Each scale question now has "1 = ... • 5 = ..." in its questionAr
// We parse the labels from there so each question shows relevant endpoints
function getScaleLabels(questionAr?: string): string[] {
  if (!questionAr) return ['أقل', 'قليل', 'متوسط', 'كثير', 'أكثر'];
  // Match pattern: "1 = LABEL  •  5 = LABEL"
  const match = questionAr.match(/1\s*=\s*(.+?)\s*[•·]\s*5\s*=\s*(.+)/);
  if (match) {
    return [match[1].trim(), '', 'متوسط', '', match[2].trim()];
  }
  return ['أقل', 'قليل', 'متوسط', 'كثير', 'أكثر'];
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { user } = useAuthStore();
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/anzaro/personality/onboard');
        if (res.ok) {
          const data = await res.json();
          setQuestions(data.questions || []);
        }
      } catch (e) {
        console.error('Failed to load questions', e);
        toast.error('فشل تحميل الأسئلة');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const q = questions[current];
  const total = questions.length;
  const progress = total ? Math.round((current / total) * 100) : 0;
  const isLast = current === total - 1;

  const canProceed = useCallback(() => {
    if (!q) return false;
    const val = answers[q.id];
    if (!val || !val.trim()) return false;
    return true;
  }, [q, answers]);

  const goNext = async () => {
    if (!canProceed()) {
      toast.error('جاوب على السؤال الأول');
      return;
    }
    if (isLast) {
      await submit();
      return;
    }
    setDirection('forward');
    setCurrent((c) => Math.min(c + 1, total - 1));
  };

  const goBack = () => {
    if (current === 0) return;
    setDirection('back');
    setCurrent((c) => Math.max(c - 1, 0));
  };

  const setAnswer = (val: string) => {
    setAnswers((a) => ({ ...a, [q.id]: val }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        answers,
        name: answers.name || user?.name || 'صديق',
      };
      if (answers.age) payload.age = Number(answers.age) || undefined;
      if (answers.occupation) payload.occupation = answers.occupation;
      if (answers.dialect) {
        const d = answers.dialect;
        payload.dialect = d.split(' ')[0].toLowerCase();
      }

      const res = await authFetch('/api/anzaro/personality/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشل حفظ البروفايل');
      }

      const data = await res.json();
      toast.success('خلصت الـ Identity Matrix! 🎉');
      console.log('[Onboarding] profile compiled', data.traits);
      onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aurora" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">بجهّز الأسئلة...</p>
        </div>
      </div>
    );
  }

  // Empty / error
  if (!total) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aurora px-6" dir="rtl">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">مفيش أسئلة متاحة دلوقتي</p>
          <Button onClick={onComplete}>تخطي والمتابعة</Button>
        </div>
      </div>
    );
  }

  const meta = categoryMeta[q.category] || categoryMeta.demographic;
  const Icon = meta.icon;

  return (
    <div
      className="min-h-screen flex flex-col bg-aurora bg-grid relative overflow-hidden"
      dir="rtl"
    >
      {/* Ambient */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-fuchsia-500/10 blur-[100px]" />

      {/* Progress header */}
      <header className="relative z-10 pt-8 px-5">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goBack}
            disabled={current === 0}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            رجوع
          </button>
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {current + 1} / {total}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-l from-primary to-fuchsia-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Dots */}
        <div className="flex gap-1 mt-2 justify-center">
          {questions.map((qq, i) => (
            <button
              key={qq.id}
              onClick={() => {
                if (i < current) {
                  setDirection('back');
                  setCurrent(i);
                }
              }}
              className="transition-all"
              aria-label={`سؤال ${i + 1}`}
            >
              {i < current ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              ) : i === current ? (
                <Circle className="w-3.5 h-3.5 text-primary fill-primary/30" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Question */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 py-6">
        <div
          key={q.id}
          className={`w-full max-w-md ${
            direction === 'forward'
              ? 'animate-in fade-in slide-in-from-left-4 duration-300'
              : 'animate-in fade-in slide-in-from-right-4 duration-300'
          }`}
        >
          {/* Category badge */}
          <div className="flex justify-center mb-5">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card/60 border border-border/40 text-xs font-semibold ${meta.color}`}>
              <Icon className="w-3.5 h-3.5" />
              {meta.label}
            </div>
          </div>

          {/* Question text */}
          <h2 className="text-2xl font-extrabold text-center leading-snug mb-8 px-2">
            {q.questionAr || q.question}
          </h2>

          {/* Input */}
          <div className="space-y-3">
            {q.inputType === 'text' && (
              <Input
                value={answers[q.id] || ''}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="اكتب إجابتك..."
                className="h-14 rounded-2xl bg-card/80 backdrop-blur border-border/50 text-base text-center"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canProceed()) goNext();
                }}
              />
            )}

            {q.inputType === 'choice' && (
              <div className="grid gap-2.5">
                {(q.optionsAr || q.options || []).map((opt, i) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        setAnswer(opt);
                        // auto-advance for choices
                        setTimeout(() => {
                          if (isLast) {
                            submit();
                          } else {
                            setDirection('forward');
                            setCurrent((c) => c + 1);
                          }
                        }, 200);
                      }}
                      className={`flex items-center justify-between px-5 py-4 rounded-2xl border text-base font-semibold transition-all ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25'
                          : 'bg-card/70 backdrop-blur border-border/50 hover:border-primary/50 hover:bg-card'
                      }`}
                    >
                      <span>{opt}</span>
                      {selected && <CheckCircle2 className="w-5 h-5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {q.inputType === 'scale' && (
              <div className="space-y-4">
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const selected = Number(answers[q.id]) === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setAnswer(String(n))}
                        className={`aspect-square rounded-2xl border-2 text-lg font-bold transition-all ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary scale-110 shadow-lg shadow-primary/30'
                            : 'bg-card/70 backdrop-blur border-border/50 hover:border-primary/40'
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground px-1">
                  <span>{getScaleLabels(q.questionAr)[0]}</span>
                  <span>{getScaleLabels(q.questionAr)[4]}</span>
                </div>
                {answers[q.id] && (
                  <p className="text-center text-sm font-semibold text-primary">
                    {Number(answers[q.id]) === 1 ? getScaleLabels(q.questionAr)[0] :
                     Number(answers[q.id]) === 5 ? getScaleLabels(q.questionAr)[4] :
                     Number(answers[q.id]) === 3 ? 'متوسط' :
                     `مائل لـ ${Number(answers[q.id]) < 3 ? getScaleLabels(q.questionAr)[0] : getScaleLabels(q.questionAr)[4]}`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer nav */}
      {q.inputType !== 'choice' && (
        <footer className="relative z-10 px-5 pb-8 pt-2">
          <Button
            onClick={goNext}
            disabled={!canProceed() || submitting}
            className="w-full h-13 py-3.5 rounded-2xl text-base font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isLast ? (
              'خلص وأنشئ البروفايل ✨'
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                التالي
                <ArrowLeft className="w-4 h-4" />
              </span>
            )}
          </Button>
        </footer>
      )}
    </div>
  );
}
