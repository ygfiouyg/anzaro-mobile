'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Play, CheckCircle2, Loader2, Clock, AlertCircle,
  ChevronDown, ChevronUp, Sparkles, RotateCcw, Search,
  Brain, Languages, FileText, Code2, Calculator, ImageIcon,
  Type, ScrollText, X, Send, RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────
interface AgentStep {
  id: number;
  title: string;
  tool: string;
  input: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  errorDetail?: string;
}

interface SSEEvent {
  type: string;
  steps?: AgentStep[];
  summary?: string;
  step?: AgentStep;
  stepId?: number;
  detail?: string;
  result?: string;
  tool?: string;
  message?: string;
  stepTitle?: string;
}

interface AgentModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTask?: string;
  onSendToChat?: (content: string) => void;
}

// ─── Example Tasks ────────────────────────────────────────────────────
const EXAMPLE_TASKS = [
  { title: 'بحث عن الذكاء الاصطناعي', desc: 'ابحث عن أحدث التطورات في مجال الذكاء الاصطناعي واكتب ملخص شامل', icon: '🔍' },
  { title: 'تحليل موضوع', desc: 'حلل إيجابيات وسلبيات التعلم عن بعد وقدم توصيات', icon: '📊' },
  { title: 'كتابة محتوى', desc: 'اكتب مقال تعريفي عن تكنولوجيا البلوكتشين بالعربية', icon: '✍️' },
  { title: 'ترجمة وتلخيص', desc: 'ترجم الملخص الإنجليزي للذكاء الاصطناعي واختصره', icon: '🌐' },
];

// ─── Tool Icons & Labels ──────────────────────────────────────────────
const TOOL_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  search: { label: 'بحث', icon: <Search className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
  analyze: { label: 'تحليل', icon: <Brain className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
  generate_text: { label: 'كتابة', icon: <Type className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
  generate_image: { label: 'صورة', icon: <ImageIcon className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
  translate: { label: 'ترجمة', icon: <Languages className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
  summarize: { label: 'تلخيص', icon: <ScrollText className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
  code: { label: 'كود', icon: <Code2 className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
  calculate: { label: 'حساب', icon: <Calculator className="size-3.5" />, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950' },
};

function getToolConfig(tool: string) {
  return TOOL_CONFIG[tool] || { label: tool, icon: <FileText className="size-3.5" />, color: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-blue-950' };
}

// ─── Step Status Icons ────────────────────────────────────────────────
function StepStatusIcon({ status }: { status: AgentStep['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-5 text-blue-500" />;
    case 'running':
      return <Loader2 className="size-5 text-blue-500 animate-spin" />;
    case 'error':
      return <AlertCircle className="size-5 text-red-500" />;
    case 'pending':
    default:
      return <Clock className="size-5 text-muted-foreground" />;
  }
}

// ─── Main Component ───────────────────────────────────────────────────
export function AgentMode({ open, onOpenChange, initialTask, onSendToChat }: AgentModeProps) {
  // State
  const [task, setTask] = useState('');
  const [maxSteps, setMaxSteps] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [planSummary, setPlanSummary] = useState('');
  const [planVisible, setPlanVisible] = useState(true);
  const [progressDetail, setProgressDetail] = useState('');
  const [finalSummary, setFinalSummary] = useState('');
  const [error, setError] = useState('');
  const [errorStepId, setErrorStepId] = useState<number | null>(null);
  const [sentToChat, setSentToChat] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Set initial task
  useEffect(() => {
    if (initialTask) {
      setTask(initialTask);
    }
  }, [initialTask]);

  // Auto-scroll to latest step
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [steps, progressDetail]);

  // ─── Start Agent ────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!task.trim() || isRunning) return;

    setIsRunning(true);
    setError('');
    setErrorStepId(null);
    setSteps([]);
    setPlanSummary('');
    setFinalSummary('');
    setSentToChat(false);
    setProgressDetail('جاري تحليل المهمة...');

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: task.trim(),
          maxSteps,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'فشل في تشغيل الوكيل الذكي');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('لا يوجد استجابة من الخادم');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const event: SSEEvent = JSON.parse(dataStr);

            switch (event.type) {
              case 'plan':
                if (event.steps) {
                  setSteps(event.steps);
                }
                if (event.summary) {
                  setPlanSummary(event.summary);
                }
                setProgressDetail('تم إنشاء الخطة. جاري التنفيذ...');
                break;

              case 'step_start':
                if (event.step) {
                  setSteps((prev) =>
                    prev.map((s) =>
                      s.id === event.step!.id ? { ...s, status: 'running' } : s
                    )
                  );
                  setProgressDetail(`جاري تنفيذ: ${event.step.title}...`);
                }
                break;

              case 'step_progress':
                if (event.detail) {
                  setProgressDetail(event.detail);
                }
                break;

              case 'step_result':
                setSteps((prev) =>
                  prev.map((s) =>
                    s.id === event.stepId
                      ? { ...s, status: 'completed', result: event.result }
                      : s
                  )
                );
                break;

              case 'step_error':
                setSteps((prev) =>
                  prev.map((s) =>
                    s.id === event.stepId
                      ? { ...s, status: 'error', errorDetail: event.message }
                      : s
                  )
                );
                setErrorStepId(event.stepId ?? null);
                break;

              case 'complete':
                if (event.summary) {
                  setFinalSummary(event.summary);
                }
                setProgressDetail('');
                setIsRunning(false);
                break;

              case 'error':
                setError(event.message || 'حدث خطأ غير معروف');
                setIsRunning(false);
                break;
            }
          } catch {
            // Skip unparseable events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled
      } else {
        setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تشغيل الوكيل');
      }
      setIsRunning(false);
    } finally {
      abortRef.current = null;
    }
  }, [task, maxSteps, isRunning]);

  // ─── Stop Agent ─────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsRunning(false);
    setProgressDetail('');
  }, []);

  // ─── Reset ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setSteps([]);
    setPlanSummary('');
    setFinalSummary('');
    setError('');
    setErrorStepId(null);
    setProgressDetail('');
    setIsRunning(false);
    setSentToChat(false);
  }, []);

  // ─── Handle Close ───────────────────────────────────────────────────
  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        handleStop();
        setTimeout(handleReset, 300);
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, handleStop, handleReset]
  );

  // ─── Send to Chat ───────────────────────────────────────────────────
  const handleSendToChat = useCallback(() => {
    if (!finalSummary || !onSendToChat) return;
    const content = `🤖 نتيجة الوكيل الذكي — ${task}\n\n${finalSummary}`;
    onSendToChat(content);
    setSentToChat(true);
  }, [finalSummary, task, onSendToChat]);

  // ─── Retry failed step ──────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setError('');
    setErrorStepId(null);
    // Re-run the entire task
    handleStart();
  }, [handleStart]);

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const errorCount = steps.filter((s) => s.status === 'error').length;
  const hasSteps = steps.length > 0;
  const isComplete = finalSummary.length > 0;
  const progressPercent = hasSteps ? Math.round((completedCount / steps.length) * 100) : 0;
  const failedStep = steps.find((s) => s.status === 'error');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl max-h-[95vh] overflow-hidden flex flex-col p-0"
        dir="rtl"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-blue-500" />
            وضع الوكيل الذكي
          </DialogTitle>
          <DialogDescription>
            وكيل ذكي يقسم المهام المعقدة إلى خطوات وينفذها تلقائياً
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Task Input + Example Cards */}
          {!isRunning && !hasSteps && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-500" />
                  وصف المهمة
                </Label>
                <Textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="مثال: ابحث عن أحدث تطورات الذكاء الاصطناعي واكتب تقريراً مفصلاً عنها..."
                  rows={4}
                  dir="auto"
                  className="text-sm resize-none"
                  autoFocus
                />
              </div>

              {/* Example Task Cards — shown when input is empty */}
              <AnimatePresence>
                {!task.trim() && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">
                      أمثلة على المهارات
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {EXAMPLE_TASKS.map((ex, i) => (
                        <motion.button
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => setTask(ex.desc)}
                          className="text-right p-3 rounded-xl border border-border hover:border-blue-300 dark:hover:border-blue-700 bg-card hover:bg-blue-50 dark:hover:bg-blue-950 transition-all group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{ex.icon}</span>
                            <span className="text-xs font-bold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {ex.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                            {ex.desc}
                          </p>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Max Steps Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Bot className="size-4 text-blue-500" />
                  الحد الأقصى للخطوات
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[1, 3, 5, 7, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMaxSteps(n)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border-2',
                        maxSteps === n
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          : 'border-border hover:border-muted-foreground text-muted-foreground'
                      )}
                    >
                      {n} خطوات
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Button */}
              <Button
                onClick={handleStart}
                disabled={!task.trim()}
                className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black h-12 text-base font-semibold"
              >
                <Play className="size-5 ml-2" />
                بدء الوكيل الذكي
              </Button>
            </motion.div>
          )}

          {/* Running / Progress View */}
          {hasSteps && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Progress Bar with Percentage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    {isRunning ? 'جاري التنفيذ...' : isComplete ? 'تم الانتهاء!' : error ? 'حدث خطأ' : ''}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] gap-1',
                      isComplete ? 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700' :
                      error ? 'text-red-600 dark:text-red-400 border-red-300 dark:border-red-700' :
                      'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
                    )}
                  >
                    {completedCount}/{steps.length} خطوات ({progressPercent}%)
                  </Badge>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={cn(
                      'h-full rounded-full',
                      isComplete ? 'bg-blue-500' : error ? 'bg-red-500' : 'bg-blue-500'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Plan Summary (Collapsible) */}
              {planSummary && (
                <Card className="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950">
                  <CardContent className="p-3">
                    <button
                      onClick={() => setPlanVisible(!planVisible)}
                      className="w-full flex items-center gap-2 text-right"
                    >
                      <Sparkles className="size-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex-1">
                        خطة التنفيذ
                      </span>
                      <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700">
                        {completedCount}/{steps.length}
                      </Badge>
                      {planVisible ? (
                        <ChevronUp className="size-4 text-blue-500" />
                      ) : (
                        <ChevronDown className="size-4 text-blue-500" />
                      )}
                    </button>
                    <AnimatePresence>
                      {planVisible && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 leading-relaxed">
                            {planSummary}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              )}

              {/* Progress Detail */}
              {progressDetail && isRunning && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
                >
                  <Loader2 className="size-4 text-blue-500 animate-spin flex-shrink-0" />
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    {progressDetail}
                  </span>
                </motion.div>
              )}

              {/* Steps List */}
              <div ref={progressRef} className="space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
                <AnimatePresence>
                  {steps.map((step, index) => {
                    const toolConfig = getToolConfig(step.tool);
                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card
                          className={cn(
                            'overflow-hidden transition-all',
                            step.status === 'running' && 'border-blue-400 dark:border-blue-600 shadow-md shadow-blue-500',
                            step.status === 'completed' && 'border-border',
                            step.status === 'error' && 'border-red-400 dark:border-red-600',
                            step.status === 'pending' && 'border-border opacity-70'
                          )}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              {/* Status Icon */}
                              <div className="flex-shrink-0 mt-0.5">
                                <StepStatusIcon status={step.status} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0 space-y-1.5">
                                {/* Header */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={cn(
                                    'text-sm font-semibold',
                                    step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
                                  )}>
                                    {step.title}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn('text-[10px] gap-1 px-1.5 py-0', toolConfig.color)}
                                  >
                                    {toolConfig.icon}
                                    {toolConfig.label}
                                  </Badge>
                                </div>

                                {/* Input preview */}
                                {step.status !== 'pending' && (
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {step.input.slice(0, 100)}{step.input.length > 100 ? '...' : ''}
                                  </p>
                                )}

                                {/* Result - show more detail */}
                                {step.status === 'completed' && step.result && (
                                  <div className={cn(
                                    'mt-2 p-2.5 rounded-lg text-xs leading-relaxed',
                                    'muted border border-border',
                                    'max-h-60 overflow-y-auto custom-scrollbar'
                                  )} dir="auto">
                                    {step.result}
                                  </div>
                                )}

                                {/* Error detail for failed step */}
                                {step.status === 'error' && (
                                  <div className="mt-2 p-2.5 rounded-lg text-xs leading-relaxed bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                                    <div className="flex items-start gap-2">
                                      <AlertCircle className="size-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                      <div className="flex-1">
                                        <p className="font-semibold text-red-700 dark:text-red-300 mb-1">
                                          فشل في الخطوة: {step.title}
                                        </p>
                                        <p className="text-red-600 dark:text-red-400">
                                          {step.errorDetail || 'حدث خطأ غير متوقع أثناء تنفيذ هذه الخطوة'}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Error - general */}
              {error && !failedStep && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                >
                  <AlertCircle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">خطأ في الوكيل</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="h-7 text-[10px] border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 gap-1"
                  >
                    <RefreshCw className="size-3" />
                    إعادة المحاولة
                  </Button>
                </motion.div>
              )}

              {/* Retry button for failed step */}
              {errorCount > 0 && failedStep && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2"
                >
                  <Button
                    onClick={handleRetry}
                    variant="outline"
                    className="flex-1 h-9 border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 gap-1.5"
                  >
                    <RefreshCw className="size-3.5" />
                    إعادة تنفيذ المهمة
                  </Button>
                </motion.div>
              )}

              {/* Final Summary */}
              {isComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="border-blue-300 dark:border-blue-700 bg-gradient-to-b from-blue-50 to-background dark:from-blue-950 dark:to-background">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-5 text-blue-500" />
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          تم الانتهاء من المهمة
                        </span>
                        <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 mr-auto">
                          {completedCount}/{steps.length} خطوات
                        </Badge>
                      </div>
                      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" dir="auto">
                        {finalSummary}
                      </div>

                      {/* Send to Chat Button */}
                      {onSendToChat && (
                        <Button
                          onClick={handleSendToChat}
                          disabled={sentToChat}
                          className={cn(
                            'w-full h-10 gap-2',
                            sentToChat
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black'
                          )}
                        >
                          {sentToChat ? (
                            <>
                              <CheckCircle2 className="size-4" />
                              تم الإرسال للشات
                            </>
                          ) : (
                            <>
                              <Send className="size-4" />
                              إرسال للشات
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                {isRunning && (
                  <Button
                    onClick={handleStop}
                    variant="outline"
                    className="flex-1 h-10 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <X className="size-4 ml-2" />
                    إيقاف
                  </Button>
                )}
                {(isComplete || error) && (
                  <>
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      className="flex-1 h-10"
                    >
                      <RotateCcw className="size-4 ml-2" />
                      مهمة جديدة
                    </Button>
                    <Button
                      onClick={() => {
                        handleReset();
                        setTask(task);
                      }}
                      className="flex-1 h-10 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
                    >
                      <Play className="size-4 ml-2" />
                      إعادة التنفيذ
                    </Button>
                  </>
                )}
              </div>

              {/* Task Display (when running or complete) */}
              {(isRunning || isComplete) && (
                <div className="text-xs text-muted-foreground px-1">
                  المهمة: {task}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
