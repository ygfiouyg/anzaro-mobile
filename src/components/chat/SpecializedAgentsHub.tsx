'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle,
  Wrench, ChevronDown, ChevronUp, Brain, RotateCcw, Sparkles, Clock,
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
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

// ─── Types ────────────────────────────────────────────────────────────
interface AgentMeta {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  icon: string;
  color: string;
  suggestions: string[];
  toolsCount: number;
}

interface ToolCallEvent {
  tool: string;
  args: unknown;
  callId: string;
  iteration: number;
}

interface ToolResultEvent {
  tool: string;
  callId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

interface SpecializedAgentsHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Main Component ───────────────────────────────────────────────────
export function SpecializedAgentsHub({ open, onOpenChange }: SpecializedAgentsHubProps) {
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentMeta | null>(null);
  const [message, setMessage] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<Array<Record<string, any>>>([]);
  const [finalAnswer, setFinalAnswer] = useState('');
  const [error, setError] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { token } = useAuthStore();

  // Load agents list
  useEffect(() => {
    if (!open || agents.length > 0) return;
    // الـ agents معرّفين في الـ frontend كمان عشان نعرضهم من غير API call
    // بس هنجيبهم من الـ API للتأكد من التزامن
    setAgents([
      {
        id: 'content_creator',
        name: 'Content Creator',
        nameAr: 'وكيل إنشاء المحتوى',
        description: 'متخصص في إنشاء محتوى احترافي لكل المنصات — مقالات، بوستات، threads، وصف منتجات، بيانات صحفية، وأكتر.',
        icon: '✍️',
        color: 'from-blue-500 to-blue-500',
        suggestions: [
          'اكتب مقال عن فوائد الذكاء الاصطناعي في التعليم',
          'حوّل المقال ده لبوستات سوشيال ميديا + thread على تويتر',
          'اكتب بيان صحفي لإطلاق منتج جديد اسمه Anzaro AI',
          'ولّد وصف منتج لـ سماعة لاسلكية + hashtags + SEO keywords',
          'حضّر ملاحظات دراسية عن أساسيات البرمجة',
          'اكتب cover letter لوظيفة Senior Developer',
          'جمّع newsletter أسبوعي عن ترندات التقنية',
          'قارن بين React و Vue و Angular في جدول',
          'اكتب قصة قصيرة عن مغامرة في الفضاء',
          'اكتب إعلان لـ تطبيق توصيل طعام على فيسبوك',
          'اعمل checklist لإطلاق منتج جديد',
        ],
        toolsCount: 28,
      },
      {
        id: 'research_analyst',
        name: 'Research Analyst',
        nameAr: 'وكيل البحث والتحليل',
        description: 'متخصص في جمع وتحليل المعلومات من الإنترنت — أبحاث، تحليل مشاعر، تلخيص، ومراقبة الترندات.',
        icon: '🔬',
        color: 'from-blue-500 to-blue-500',
        suggestions: [
          'ابحث عن أحدث ترندات الذكاء الاصطناعي ولخصها لي',
          'حلل مشاعر التعليقات على فيديو يوتيوب معين',
          'اجمع أخبار Hacker News لليوم واعمل digest',
          'ابحث عن آراء الناس على Reddit عن منتج معين',
          'حلل تعليقات على Reddit وكشف أي لغة سامة أو مسيئة',
          'قيّم فكرة عمل: تطبيق توصيل طعام في مدينة صغيرة',
          'استخرج بيانات من نص فاتورة',
          'حلّل مراجعات عملاء لـ منتج معين ولخّصها',
          'حوّل 1000 دولار لجنيه مصري بالسعر الحالي',
          'ابحث عن معلومات عن الثورة الصناعية في ويكيبيديا',
          'ما هو سعر سهم Apple (AAPL) دلوقتي؟',
        ],
        toolsCount: 22,
      },
      {
        id: 'developer_helper',
        name: 'Developer Helper',
        nameAr: 'وكيل مساعدة المطورين',
        description: 'متخصص في مساعدة المطورين — تنفيذ كود، مراجعة، توثيق، وحل المشاكل البرمجية.',
        icon: '💻',
        color: 'from-blue-500 to-blue-500',
        suggestions: [
          'راجع الكود ده وقولي المشاكل اللي فيه',
          'نفّذ دالة JavaScript ترتّب array من الأكبر للأصغر',
          'ابحث عن أفضل practices لـ React hooks ولخصها',
          'ولّد مستند DOCX يشرح API معين',
        ],
        toolsCount: 10,
      },
    ]);
  }, [open, agents.length]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, finalAnswer]);

  const toggleTool = (callId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) next.delete(callId);
      else next.add(callId);
      return next;
    });
  };

  // ─── Run Specialized Agent ──────────────────────────────────────────
  const handleRun = useCallback(async (msg?: string) => {
    const userMsg = (msg ?? message).trim();
    if (!userMsg || !selectedAgent || isRunning) return;

    setMessage(userMsg);
    setIsRunning(true);
    setError('');
    setEvents([]);
    setFinalAnswer('');

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await fetch('/api/agent/specialized', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message: userMsg,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'فشل في تشغيل الوكيل');
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
            const event = JSON.parse(dataStr);

            switch (event.type) {
              case 'agent_info':
                // metadata الوكيل
                break;

              case 'iteration_start':
                setEvents((prev) => [
                  ...prev,
                  { type: 'iteration', iteration: event.iteration, max: event.max },
                ]);
                break;

              case 'thinking':
                setEvents((prev) => [
                  ...prev,
                  { type: 'thinking', content: event.content },
                ]);
                break;

              case 'assistant_chunk':
                setEvents((prev) => [
                  ...prev,
                  { type: 'chunk', content: event.content },
                ]);
                break;

              case 'tool_call':
                setEvents((prev) => [
                  ...prev,
                  {
                    type: 'tool_call',
                    tool: event.tool,
                    args: event.args,
                    callId: event.callId,
                    iteration: event.iteration,
                  },
                ]);
                break;

              case 'tool_result':
                setEvents((prev) => [
                  ...prev,
                  {
                    type: 'tool_result',
                    tool: event.tool,
                    callId: event.callId,
                    success: event.success,
                    data: event.data,
                    error: event.error,
                    durationMs: event.durationMs,
                  },
                ]);
                break;

              case 'final_answer':
                setFinalAnswer(event.content || '');
                setIsRunning(false);
                break;

              case 'error':
                setError(event.message || 'حدث خطأ');
                setIsRunning(false);
                break;

              case 'done':
                setIsRunning(false);
                break;
            }
          } catch {
            // skip unparseable
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      }
      setIsRunning(false);
    }
  }, [message, selectedAgent, isRunning, token]);

  const handleReset = () => {
    setEvents([]);
    setFinalAnswer('');
    setError('');
    setMessage('');
  };

  const handleBack = () => {
    setSelectedAgent(null);
    handleReset();
  };

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl h-[88vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-blue-500" />
            الوكلاء المتخصصون
          </DialogTitle>
          <DialogDescription className="text-xs">
            وكلاء AI متخصصون في مجالات محددة — بيستخدموا أدوات MCP تلقائياً
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {/* ─── Agent Selection Screen ─── */}
            {!selectedAgent ? (
              <motion.div
                key="selection"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-y-auto custom-scrollbar p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {agents.map((agent) => (
                    <motion.button
                      key={agent.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedAgent(agent)}
                      className="text-right group relative overflow-hidden rounded-xl border border-border bg-card p-4 hover:border-primary transition-all"
                    >
                      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-5 group-hover:opacity-10 transition-opacity', agent.color)} />
                      <div className="relative space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-3xl">{agent.icon}</span>
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Wrench className="size-2.5" />
                            {agent.toolsCount} أداة
                          </Badge>
                        </div>
                        <h3 className="text-sm font-bold text-foreground">{agent.nameAr}</h3>
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                          {agent.description}
                        </p>
                        <div className={cn('inline-flex items-center gap-1 text-[11px] font-semibold bg-gradient-to-r bg-clip-text text-transparent', agent.color)}>
                          ابدأ
                          <ArrowLeft className="size-3" />
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* ─── Chat Screen ─── */
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                {/* Agent Header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted">
                  <Button variant="ghost" size="sm" onClick={handleBack} className="h-8 gap-1 text-xs">
                    <ArrowRight className="size-3.5" />
                    رجوع
                  </Button>
                  <div className="flex items-center gap-2 mr-auto">
                    <span className="text-xl">{selectedAgent.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-foreground">{selectedAgent.nameAr}</p>
                      <p className="text-[10px] text-muted-foreground">{selectedAgent.toolsCount} أداة متاحة</p>
                    </div>
                  </div>
                  {(events.length > 0 || finalAnswer) && !isRunning && (
                    <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 gap-1 text-xs">
                      <RotateCcw className="size-3.5" />
                      جديد
                    </Button>
                  )}
                </div>

                {/* Events / Output Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                  {/* Suggestions (only when no events) */}
                  {events.length === 0 && !finalAnswer && !isRunning && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground text-center pt-4">جرّب أحد الاقتراحات أو اكتب طلبك:</p>
                      {selectedAgent.suggestions.map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => handleRun(sug)}
                          className="w-full text-right p-2.5 rounded-lg border border-border bg-card hover:border-primary hover:bg-accent transition-all text-xs"
                        >
                          <span className="text-muted-foreground">{i + 1}.</span> {sug}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* User message echo */}
                  {message && (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-xs">
                        {message}
                      </div>
                    </div>
                  )}

                  {/* Events */}
                  {events.map((ev, i) => {
                    if (ev.type === 'iteration') {
                      return (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          تكرار {ev.iteration} / {ev.max}
                        </div>
                      );
                    }
                    if (ev.type === 'thinking') {
                      return (
                        <div key={i} className="rounded-lg bg-blue-500 border border-blue-500 p-2.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1">
                            <Brain className="size-3" />
                            تفكير
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-wrap" dir="auto">{ev.content}</p>
                        </div>
                      );
                    }
                    if (ev.type === 'tool_call') {
                      return (
                        <div key={i} className="rounded-lg bg-blue-500 border border-blue-500 p-2.5">
                          <div className="flex items-center gap-1.5">
                            <Wrench className="size-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{ev.tool}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleTool(ev.callId)}
                              className="h-5 w-5 p-0 ml-auto"
                            >
                              {expandedTools.has(ev.callId) ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </Button>
                          </div>
                          {expandedTools.has(ev.callId) && (
                            <pre className="mt-1.5 text-[10px] muted rounded p-2 overflow-x-auto max-h-40" dir="ltr">
                              {JSON.stringify(ev.args, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    }
                    if (ev.type === 'tool_result') {
                      const ok = ev.success;
                      return (
                        <div key={i} className={cn('rounded-lg border p-2.5', ok ? 'bg-muted border-border' : 'bg-red-500 border-red-500')}>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {ok ? <CheckCircle2 className="size-3 text-blue-500" /> : <AlertCircle className="size-3 text-red-500" />}
                            <span className="text-muted-foreground">نتيجة {ev.tool}</span>
                            <span className="text-muted-foreground ml-auto flex items-center gap-0.5">
                              <Clock className="size-2.5" />
                              {ev.durationMs}ms
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleTool(`result-${ev.callId}`)}
                              className="h-5 w-5 p-0"
                            >
                              {expandedTools.has(`result-${ev.callId}`) ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </Button>
                          </div>
                          {expandedTools.has(`result-${ev.callId}`) && (
                            <pre className="mt-1.5 text-[10px] muted rounded p-2 overflow-x-auto max-h-48" dir="ltr">
                              {JSON.stringify(ok ? ev.data : { error: ev.error }, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}

                  {/* Final Answer */}
                  {finalAnswer && (
                    <Card className="border-blue-300 dark:border-blue-700 bg-gradient-to-b from-blue-50 to-background dark:from-blue-950 dark:to-background">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-4 text-blue-500" />
                          <span className="text-xs font-bold text-blue-700 dark:text-blue-300">الإجابة النهائية</span>
                        </div>
                        <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap" dir="auto">
                          {finalAnswer}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                      <AlertCircle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-red-700 dark:text-red-300">خطأ</p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* Loading */}
                  {isRunning && events.length === 0 && (
                    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                      <Loader2 className="size-5 animate-spin" />
                      <span className="text-xs">جاري التحليل...</span>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="border-t border-border p-3 flex gap-2">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleRun();
                      }
                    }}
                    placeholder={`اكتب طلبك لـ ${selectedAgent.nameAr}...`}
                    className="min-h-[40px] max-h-32 text-xs resize-none"
                    rows={1}
                    disabled={isRunning}
                  />
                  <Button
                    onClick={() => handleRun()}
                    disabled={isRunning || !message.trim()}
                    size="sm"
                    className="h-10 px-3"
                  >
                    {isRunning ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
