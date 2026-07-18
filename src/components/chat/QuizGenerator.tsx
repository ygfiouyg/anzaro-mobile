'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, CheckCircle2, XCircle, Clock, Trophy, RotateCcw,
  Plus, Sparkles, ChevronLeft, ChevronRight, Share2,
  Loader2, BookOpen, Target, Flame, Award,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────
interface QuizQuestion {
  id: string;
  type: 'mcq' | 'true-false' | 'short-answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
}

interface QuizResult {
  questions: QuizQuestion[];
  title: string;
}

type Step = 'setup' | 'quiz' | 'results';

interface QuizGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-generated quiz data from chat (auto-triggered) */
  autoQuizData?: {
    title: string;
    questions: QuizQuestion[];
    source?: 'chat' | 'files';
  } | null;
  /** Topic from slash command to pre-fill or auto-generate */
  initialTopic?: string;
}

// ─── Difficulty Config ────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy: { label: 'سهل', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-950', border: 'border-blue-300 dark:border-blue-700', icon: '🌱' },
  medium: { label: 'متوسط', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-950', border: 'border-blue-300 dark:border-blue-700', icon: '🔥' },
  hard: { label: 'صعب', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-950', border: 'border-red-300 dark:border-red-700', icon: '💀' },
};

const TYPE_CONFIG = {
  mcq: { label: 'اختيار من متعدد', icon: '🔘' },
  'true-false': { label: 'صح أم خطأ', icon: '✅' },
  'short-answer': { label: 'إجابة قصيرة', icon: '✍️' },
};

const GRADE_THRESHOLDS = [
  { min: 90, label: 'ممتاز', emoji: '🌟', color: 'text-blue-500' },
  { min: 80, label: 'جيد جداً', emoji: '⭐', color: 'text-blue-500' },
  { min: 70, label: 'جيد', emoji: '👍', color: 'text-blue-500' },
  { min: 60, label: 'مقبول', emoji: '😐', color: 'text-blue-500' },
  { min: 0, label: 'راسب', emoji: '😔', color: 'text-red-500' },
];

function getGrade(percentage: number) {
  return GRADE_THRESHOLDS.find((g) => percentage >= g.min) || GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
}

// ─── Timer Component ──────────────────────────────────────────────────
function QuestionTimer({ seconds, onTimeout, isActive }: { seconds: number; onTimeout: () => void; isActive: boolean }) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, onTimeout, seconds]);

  const percentage = (timeLeft / seconds) * 100;
  const isLow = timeLeft <= 5;

  return (
    <div className="flex items-center gap-2">
      <Clock className={cn('size-4', isLow ? 'text-red-500' : 'text-muted-foreground')} />
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', isLow ? 'bg-red-500' : 'bg-blue-500')}
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <span className={cn('text-xs font-mono min-w-[20px]', isLow ? 'text-red-500 font-bold' : 'text-muted-foreground')}>
        {timeLeft}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────
export function QuizGenerator({ open, onOpenChange, autoQuizData, initialTopic }: QuizGeneratorProps) {
  // Setup state
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionCount, setQuestionCount] = useState('10');
  const [selectedTypes, setSelectedTypes] = useState<('mcq' | 'true-false' | 'short-answer')[]>(['mcq', 'true-false']);

  // Quiz state
  const [step, setStep] = useState<Step>('setup');
  const [quizData, setQuizData] = useState<QuizResult | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [score, setScore] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [shortAnswerInput, setShortAnswerInput] = useState('');

  const currentQuestion = quizData?.questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;

  // ─── Auto-start quiz from chat data ────────────────────────────────
  // Use a ref to prevent race conditions when multiple quiz data sources fire simultaneously
  const autoQuizAppliedRef = useRef<string>('');
  useEffect(() => {
    if (autoQuizData && open) {
      // Create a fingerprint of the quiz data to avoid applying the same data twice
      const fingerprint = `${autoQuizData.questions.length}-${autoQuizData.questions[0]?.question?.slice(0, 50)}`;
      if (autoQuizAppliedRef.current === fingerprint) return; // Already applied this quiz
      autoQuizAppliedRef.current = fingerprint;

      // Auto-populate quiz from chat-generated data
      // This works regardless of current step — force to quiz
      const total = autoQuizData.questions.reduce((sum, q) => sum + q.points, 0);
      setQuizData(autoQuizData);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setScore(0);
      setTotalPoints(total);
      setShowFeedback(false);
      setLastAnswerCorrect(null);
      setShortAnswerInput('');
      setStep('quiz');
    }
  }, [autoQuizData, open]);

  // ─── Pre-fill topic from slash command ─────────────────────────────
  useEffect(() => {
    if (initialTopic && initialTopic.trim() && open) {
      setTopic(initialTopic.trim());
    }
  }, [initialTopic, open]);

  // ─── Generate Quiz ────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) {
      toast.error('يرجى إدخال الموضوع');
      return;
    }
    if (selectedTypes.length === 0) {
      toast.error('يرجى اختيار نوع أسئلة واحد على الأقل');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          content: content.trim() || undefined,
          questionCount: parseInt(questionCount, 10),
          difficulty,
          types: selectedTypes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'فشل في توليد الاختبار');
      }

      const data: QuizResult = await response.json();
      setQuizData(data);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setScore(0);
      setShowFeedback(false);
      setLastAnswerCorrect(null);
      setShortAnswerInput('');

      // Calculate total points
      const total = data.questions.reduce((sum, q) => sum + q.points, 0);
      setTotalPoints(total);

      setStep('quiz');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل في توليد الاختبار');
    } finally {
      setIsGenerating(false);
    }
  }, [topic, content, questionCount, difficulty, selectedTypes]);

  // ─── Answer Question ──────────────────────────────────────────────
  const handleAnswer = useCallback((answer: string) => {
    if (!currentQuestion || answers[currentQuestion.id]) return;

    // Normalize both answers for comparison
    const normalizeForCompare = (s: string) =>
      s.trim().replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').toLowerCase();

    const isCorrect = normalizeForCompare(answer) === normalizeForCompare(currentQuestion.correctAnswer);

    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }));
    setLastAnswerCorrect(isCorrect);
    setShowFeedback(true);

    if (isCorrect) {
      setScore((prev) => prev + currentQuestion.points);
    }
  }, [currentQuestion, answers]);

  // ─── Handle Short Answer Submit ───────────────────────────────────
  const handleShortAnswerSubmit = useCallback(() => {
    if (!shortAnswerInput.trim() || !currentQuestion) return;
    handleAnswer(shortAnswerInput.trim());
  }, [shortAnswerInput, currentQuestion, handleAnswer]);

  // ─── Timer Timeout ────────────────────────────────────────────────
  const handleTimeout = useCallback(() => {
    if (!currentQuestion || answers[currentQuestion.id]) return;
    handleAnswer('__TIMEOUT__');
  }, [currentQuestion, answers, handleAnswer]);

  // ─── Next Question ────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (!quizData) return;

    setShowFeedback(false);
    setLastAnswerCorrect(null);
    setShortAnswerInput('');

    if (currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setStep('results');
    }
  }, [quizData, currentQuestionIndex]);

  // ─── Previous Question ────────────────────────────────────────────
  const handlePrevious = useCallback(() => {
    if (currentQuestionIndex > 0 && !showFeedback) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  }, [currentQuestionIndex, showFeedback]);

  // ─── Try Again ────────────────────────────────────────────────────
  const handleTryAgain = useCallback(() => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowFeedback(false);
    setLastAnswerCorrect(null);
    setShortAnswerInput('');
    setStep('quiz');
  }, []);

  // ─── New Quiz ─────────────────────────────────────────────────────
  const handleNewQuiz = useCallback(() => {
    setQuizData(null);
    setTopic('');
    setContent('');
    setAnswers({});
    setCurrentQuestionIndex(0);
    setScore(0);
    setTotalPoints(0);
    setShowFeedback(false);
    setLastAnswerCorrect(null);
    setShortAnswerInput('');
    setStep('setup');
  }, []);

  // ─── Share Results ────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    if (!quizData) return;
    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const grade = getGrade(percentage);
    const normalizeForCompare = (s: string) =>
      s.trim().replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').toLowerCase();

    const text = `📝 نتيجة اختبري على Anzaro AI\n\n` +
      `📋 ${quizData.title}\n` +
      `📊 النتيجة: ${score}/${totalPoints} (${percentage}%)\n` +
      `${grade.emoji} التقدير: ${grade.label}\n` +
      `✅ الإجابات الصحيحة: ${Object.entries(answers).filter(([id, ans]) => {
        const q = quizData.questions.find((q) => q.id === id);
        return q ? normalizeForCompare(ans) === normalizeForCompare(q.correctAnswer) : false;
      }).length}/${quizData.questions.length}`;

    if (navigator.share) {
      navigator.share({ title: quizData.title, text }).catch(() => {
        navigator.clipboard.writeText(text);
        toast.success('تم نسخ النتيجة!');
      });
    } else {
      navigator.clipboard.writeText(text);
      toast.success('تم نسخ النتيجة!');
    }
  }, [quizData, score, totalPoints, answers]);

  // ─── Toggle Type ──────────────────────────────────────────────────
  const toggleType = (type: 'mcq' | 'true-false' | 'short-answer') => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // ─── Reset on Close ───────────────────────────────────────────────
  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      // Reset state immediately so we're ready for a new auto-quiz
      // The dialog animation will still play because it's controlled by `open` prop
      setStep('setup');
      setQuizData(null);
      setTopic('');
      setContent('');
      setAnswers({});
      setCurrentQuestionIndex(0);
      setScore(0);
      setTotalPoints(0);
      setShowFeedback(false);
      setLastAnswerCorrect(null);
      setShortAnswerInput('');
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

  // ─── Render Setup Step ──────────────────────────────────────────────
  const renderSetup = () => (
    <div className="space-y-5">
      {/* Topic Input */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Target className="size-4 text-blue-500" />
          الموضوع *
        </Label>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="مثال: الذكاء الاصطناعي، التاريخ الإسلامي، الفيزياء النووية..."
          dir="auto"
          className="text-sm"
        />
      </div>

      {/* Content (Optional) */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="size-4 text-blue-500" />
          محتوى إضافي <span className="text-muted-foreground font-normal">(اختياري)</span>
        </Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="الصق محتوى مستند أو محادثة لتوليد أسئلة منها..."
          rows={3}
          dir="auto"
          className="text-sm resize-none"
        />
      </div>

      {/* Difficulty */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Flame className="size-4 text-blue-500" />
          مستوى الصعوبة
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {(['easy', 'medium', 'hard'] as const).map((diff) => {
            const config = DIFFICULTY_CONFIG[diff];
            return (
              <button
                key={diff}
                onClick={() => setDifficulty(diff)}
                className={cn(
                  'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all',
                  difficulty === diff
                    ? `${config.border} ${config.bg} shadow-sm`
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <span className="text-xl">{config.icon}</span>
                <span className={cn('text-xs font-semibold', difficulty === diff ? config.color : 'text-muted-foreground')}>
                  {config.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Question Count */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Brain className="size-4 text-blue-500" />
          عدد الأسئلة
        </Label>
        <Select value={questionCount} onValueChange={setQuestionCount}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 16 }, (_, i) => i + 5).map((n) => (
              <SelectItem key={n} value={String(n)}>{n} سؤال</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Question Types */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">أنواع الأسئلة</Label>
        <div className="space-y-2">
          {(['mcq', 'true-false', 'short-answer'] as const).map((type) => {
            const config = TYPE_CONFIG[type];
            return (
              <label
                key={type}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                  selectedTypes.includes(type)
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <Checkbox
                  checked={selectedTypes.includes(type)}
                  onCheckedChange={() => toggleType(type)}
                />
                <span className="text-lg">{config.icon}</span>
                <span className="text-sm font-medium">{config.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Timer Toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl muted border border-border">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">مؤقت لكل سؤال (30 ثانية)</span>
        </div>
        <button
          onClick={() => setTimerEnabled(!timerEnabled)}
          className={cn(
            'w-11 h-6 rounded-full transition-all relative',
            timerEnabled ? 'bg-blue-500' : 'bg-muted-foreground'
          )}
          role="switch"
          aria-checked={timerEnabled}
          aria-label="تفعيل المؤقت"
        >
          <motion.div
            className="absolute top-1 size-4 rounded-full bg-white shadow-sm"
            animate={{ left: timerEnabled ? '24px' : '4px' }}
            transition={{ duration: 0.2 }}
          />
        </button>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || !topic.trim() || selectedTypes.length === 0}
        className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black h-12 text-base font-semibold"
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-5 ml-2 animate-spin" />
            جاري توليد الاختبار...
          </>
        ) : (
          <>
            <Sparkles className="size-5 ml-2" />
            توليد الاختبار
          </>
        )}
      </Button>
    </div>
  );

  // ─── Render Quiz Step ───────────────────────────────────────────────
  const renderQuiz = () => {
    if (!quizData || !currentQuestion) return null;

    const isAnswered = !!answers[currentQuestion.id];
    const userAnswer = answers[currentQuestion.id];
    const progressPercent = ((currentQuestionIndex + (isAnswered ? 1 : 0)) / quizData.questions.length) * 100;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground truncate flex-1 ml-2">{quizData.title}</h3>
            {timerEnabled && !isAnswered && (
              <QuestionTimer seconds={30} onTimeout={handleTimeout} isActive={!isAnswered} />
            )}
          </div>

          {autoQuizData && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
              <Sparkles className="size-3" />
              <span>{autoQuizData.source === 'files'
                ? 'اختبار مُولّد تلقائياً من محتوى الملفات'
                : 'اختبار مُولّد تلقائياً من المحادثة'}</span>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>السؤال {currentQuestionIndex + 1} من {quizData.questions.length}</span>
              <span>النقاط: {score}/{totalPoints}</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3 }}
          >
            <Card className={cn(
              'border-2 overflow-hidden',
              showFeedback
                ? lastAnswerCorrect
                  ? 'border-blue-500 dark:border-blue-400'
                  : 'border-red-500 dark:border-red-400'
                : 'border-blue-300 dark:border-blue-700'
            )}>
              <CardContent className="p-4 space-y-4">
                {/* Question Header */}
                <div className="flex items-start gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'flex-shrink-0 text-xs',
                      DIFFICULTY_CONFIG[currentQuestion.difficulty].color,
                      DIFFICULTY_CONFIG[currentQuestion.difficulty].bg,
                      DIFFICULTY_CONFIG[currentQuestion.difficulty].border
                    )}
                  >
                    {DIFFICULTY_CONFIG[currentQuestion.difficulty].icon} {DIFFICULTY_CONFIG[currentQuestion.difficulty].label}
                  </Badge>
                  <Badge variant="secondary" className="flex-shrink-0 text-xs">
                    {TYPE_CONFIG[currentQuestion.type].icon} {TYPE_CONFIG[currentQuestion.type].label}
                  </Badge>
                  <Badge variant="outline" className="flex-shrink-0 text-xs">
                    {currentQuestion.points} نقطة
                  </Badge>
                </div>

                {/* Question Text */}
                <p className="text-base font-semibold leading-relaxed" dir="auto">
                  {currentQuestion.question}
                </p>

                {/* Answer Options */}
                {currentQuestion.type === 'short-answer' ? (
                  <div className="flex gap-2">
                    <Input
                      value={shortAnswerInput}
                      onChange={(e) => setShortAnswerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && shortAnswerInput.trim()) {
                          handleShortAnswerSubmit();
                        }
                      }}
                      placeholder="اكتب إجابتك هنا..."
                      dir="auto"
                      disabled={isAnswered}
                      className="flex-1"
                    />
                    {!isAnswered && (
                      <Button
                        onClick={handleShortAnswerSubmit}
                        disabled={!shortAnswerInput.trim()}
                        className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
                      >
                        تأكيد
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentQuestion.options?.map((option, idx) => {
                      const isSelected = userAnswer === option;
                      const isCorrectOption = option === currentQuestion.correctAnswer;
                      const showResult = showFeedback;

                      return (
                        <motion.button
                          key={idx}
                          onClick={() => !isAnswered && handleAnswer(option)}
                          disabled={isAnswered}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all',
                            !showResult && !isSelected && 'border-border hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950',
                            !showResult && isSelected && 'border-blue-500 bg-blue-50 dark:bg-blue-950',
                            showResult && isCorrectOption && 'border-blue-500 bg-blue-50 dark:bg-blue-950',
                            showResult && isSelected && !isCorrectOption && 'border-red-500 bg-red-50 dark:bg-red-950',
                            showResult && !isCorrectOption && !isSelected && 'border-border opacity-60',
                            isAnswered && 'cursor-default'
                          )}
                          whileHover={!isAnswered ? { scale: 1.01 } : {}}
                          whileTap={!isAnswered ? { scale: 0.99 } : {}}
                        >
                          <span className={cn(
                            'flex-shrink-0 size-7 rounded-full border-2 flex items-center justify-center text-xs font-bold',
                            showResult && isCorrectOption
                              ? 'border-blue-500 bg-blue-500 text-white'
                              : showResult && isSelected && !isCorrectOption
                                ? 'border-red-500 bg-red-500 text-white'
                                : isSelected
                                  ? 'border-blue-500 text-blue-600'
                                  : 'border-muted-foreground text-muted-foreground'
                          )}>
                            {showResult && isCorrectOption ? (
                              <CheckCircle2 className="size-4" />
                            ) : showResult && isSelected && !isCorrectOption ? (
                              <XCircle className="size-4" />
                            ) : (
                              String.fromCharCode(1571 + idx)
                            )}
                          </span>
                          <span className={cn(
                            'text-sm font-medium flex-1',
                            showResult && isCorrectOption && 'text-blue-700 dark:text-blue-300',
                            showResult && isSelected && !isCorrectOption && 'text-red-700 dark:text-red-300'
                          )} dir="auto">
                            {option}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Feedback */}
                <AnimatePresence>
                  {showFeedback && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={cn(
                        'p-3 rounded-xl border',
                        lastAnswerCorrect
                          ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                          : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {lastAnswerCorrect ? (
                          <>
                            <CheckCircle2 className="size-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">إجابة صحيحة! 🎉</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="size-4 text-red-600 dark:text-red-400" />
                            <span className="text-sm font-bold text-red-700 dark:text-red-300">إجابة خاطئة</span>
                          </>
                        )}
                        <Badge variant="outline" className="mr-auto text-xs">
                          +{lastAnswerCorrect ? currentQuestion.points : 0} نقطة
                        </Badge>
                      </div>
                      {!lastAnswerCorrect && currentQuestion.type !== 'short-answer' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          الإجابة الصحيحة: <span className="font-bold text-blue-600 dark:text-blue-400">{currentQuestion.correctAnswer}</span>
                        </p>
                      )}
                      {currentQuestion.explanation && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic" dir="auto">
                          💡 {currentQuestion.explanation}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0 || showFeedback}
          >
            <ChevronRight className="size-4 ml-1" />
            السابق
          </Button>

          <div className="flex items-center gap-1">
            {quizData.questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => !showFeedback && idx < currentQuestionIndex && setCurrentQuestionIndex(idx)}
                className={cn(
                  'size-2 rounded-full transition-all',
                  idx === currentQuestionIndex
                    ? 'bg-blue-500 w-4'
                    : answers[quizData.questions[idx].id]
                      ? 'bg-blue-300 dark:bg-blue-700'
                      : 'bg-muted-foreground'
                )}
                aria-label={`الانتقال للسؤال ${idx + 1}`}
              />
            ))}
          </div>

          {isAnswered ? (
            <Button
              onClick={handleNext}
              size="sm"
              className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
            >
              {currentQuestionIndex < quizData.questions.length - 1 ? (
                <>
                  التالي
                  <ChevronLeft className="size-4 mr-1" />
                </>
              ) : (
                <>
                  <Trophy className="size-4 mr-1" />
                  النتيجة
                </>
              )}
            </Button>
          ) : (
            <div className="w-[60px]" />
          )}
        </div>
      </div>
    );
  };

  // ─── Render Results Step ─────────────────────────────────────────────
  const renderResults = () => {
    if (!quizData) return null;

    const grade = getGrade(percentage);
    const normalizeForCompare = (s: string) =>
      s.trim().replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').toLowerCase();

    const correctCount = quizData.questions.filter(
      (q) => normalizeForCompare(answers[q.id] || '') === normalizeForCompare(q.correctAnswer)
    ).length;

    return (
      <div className="space-y-5">
        {/* Score Card */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="text-center space-y-3 p-6 rounded-2xl bg-gradient-to-b from-blue-50 to-background dark:from-blue-950 dark:to-background border border-blue-200 dark:border-blue-800"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
            className="text-5xl"
          >
            {grade.emoji}
          </motion.div>
          <div>
            <h3 className={cn('text-2xl font-bold', grade.color)}>{grade.label}</h3>
            <p className="text-sm text-muted-foreground mt-1">{quizData.title}</p>
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{percentage}%</p>
              <p className="text-xs text-muted-foreground">النسبة</p>
            </div>
            <div className="size-px h-10 bg-border" />
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{score}/{totalPoints}</p>
              <p className="text-xs text-muted-foreground">النقاط</p>
            </div>
            <div className="size-px h-10 bg-border" />
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{correctCount}/{quizData.questions.length}</p>
              <p className="text-xs text-muted-foreground">صحيح</p>
            </div>
          </div>
        </motion.div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress value={percentage} className="h-3" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span>{percentage}%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Review Questions */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            مراجعة الأسئلة
          </h4>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {quizData.questions.map((q, idx) => {
              const userAns = answers[q.id];
              const isCorrect = normalizeForCompare(userAns || '') === normalizeForCompare(q.correctAnswer);
              const wasTimeout = userAns === '__TIMEOUT__';

              return (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    'p-3 rounded-xl border',
                    isCorrect
                      ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950'
                      : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 mt-0.5">
                      {isCorrect ? (
                        <CheckCircle2 className="size-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <XCircle className="size-4 text-red-600 dark:text-red-400" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium" dir="auto">{idx + 1}. {q.question}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {!isCorrect && (
                          <span className="text-red-600 dark:text-red-400">
                            إجابتك: {wasTimeout ? 'انتهى الوقت ⏰' : userAns || 'لم تُجب'}
                          </span>
                        )}
                        <span className="text-blue-600 dark:text-blue-400">
                          الإجابة الصحيحة: {q.correctAnswer}
                        </span>
                      </div>
                      {q.explanation && (
                        <p className="text-xs text-muted-foreground italic" dir="auto">💡 {q.explanation}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] flex-shrink-0',
                        DIFFICULTY_CONFIG[q.difficulty].color
                      )}
                    >
                      {q.points}ن
                    </Badge>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleTryAgain}
            variant="outline"
            className="flex-1 h-10"
          >
            <RotateCcw className="size-4 ml-2" />
            إعادة المحاولة
          </Button>
          <Button
            onClick={handleNewQuiz}
            variant="outline"
            className="flex-1 h-10"
          >
            <Plus className="size-4 ml-2" />
            اختبار جديد
          </Button>
          <Button
            onClick={handleShare}
            className="flex-1 h-10 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
          >
            <Share2 className="size-4 ml-2" />
            مشاركة
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'setup' && (
              <>
                <Brain className="size-5 text-blue-500" />
                مولّد الاختبارات
              </>
            )}
            {step === 'quiz' && (
              <>
                <Target className="size-5 text-blue-500" />
                {quizData?.title || 'الاختبار'}
              </>
            )}
            {step === 'results' && (
              <>
                <Award className="size-5 text-blue-500" />
                النتيجة النهائية
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === 'setup' && 'أنشئ اختباراً ذكياً من أي موضوع باستخدام الذكاء الاصطناعي'}
            {step === 'quiz' && `السؤال ${currentQuestionIndex + 1} من ${quizData?.questions.length || 0}`}
            {step === 'results' && `${percentage}% — ${getGrade(percentage).label}`}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'setup' && renderSetup()}
            {step === 'quiz' && renderQuiz()}
            {step === 'results' && renderResults()}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
