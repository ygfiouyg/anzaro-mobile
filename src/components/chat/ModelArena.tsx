'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Trophy, Loader2, X, Check, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  models,
  getModelById,
  type AIModel,
} from '@/lib/models';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';

interface ModelArenaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Arena Model Card (for selection) ────────────────────────────────
function ArenaModelCard({
  model,
  selected,
  onToggle,
  disabled,
}: {
  model: AIModel;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'relative text-right p-3 rounded-xl border-2 transition-all duration-200 min-h-[72px] w-full',
        'hover:shadow-md',
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
          : 'border-border bg-card hover:border-blue-500',
        disabled && !selected && 'opacity-40 cursor-not-allowed'
      )}
      dir="rtl"
    >
      {selected && (
        <div className="absolute top-2 left-2">
          <div className="size-5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
            <Check className="size-3 text-white dark:text-black" />
          </div>
        </div>
      )}
      <h3 className="font-bold text-sm text-foreground">{model.name}</h3>
      <span className="text-[10px] text-muted-foreground font-mono">{model.nameEn}</span>
      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
      <div className="flex gap-1 mt-1">
        {model.openSource && <Badge variant="secondary" className="text-[7px] px-1 py-0">مفتوح</Badge>}
        <Badge variant="secondary" className="text-[7px] px-1 py-0">{model.rank}</Badge>
      </div>
    </button>
  );
}

// ─── Streaming Response Column ───────────────────────────────────────
function ArenaResponseColumn({
  modelId,
  modelName,
  content,
  done,
  vote,
  onVote,
  canVote,
  voteCount,
}: {
  modelId: string;
  modelName: string;
  content: string;
  done: boolean;
  vote?: number;
  onVote: (vote: number) => void;
  canVote: boolean;
  voteCount: number;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card overflow-hidden" dir="rtl">
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-3 border-b',
        vote === 1 ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' :
        'bg-muted'
      )}>
        <div className={cn(
          'size-3 rounded-full',
          done ? 'bg-blue-500' : 'bg-blue-500 animate-pulse'
        )} />
        <h3 className="font-bold text-sm flex-1">{modelName}</h3>
        {done && (
          <Badge variant="secondary" className="text-[9px]">اكتمل</Badge>
        )}
        {!done && content && (
          <Badge className="text-[9px] bg-blue-500 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">بث...</Badge>
        )}
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-4 min-h-[200px] max-h-[400px]"
      >
        {content ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {content}
            {!done && <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse mr-0.5 align-middle" />}
          </div>
        ) : done ? (
          <p className="text-sm text-muted-foreground italic">لم يتم تلقي رد من هذا النموذج.</p>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">جاري الانتظار...</span>
          </div>
        )}
      </div>

      {/* Vote Section */}
      {done && content && (
        <div className="border-t p-3">
          {vote !== undefined ? (
            <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
              <Trophy className="size-4" />
              <span className="text-sm font-bold">
                {vote === 1 ? 'فاز هذا النموذج!' : `المركز ${vote}`}
              </span>
            </div>
          ) : canVote ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
                onClick={() => onVote(1)}
              >
                <Trophy className="size-3.5" />
                صوّت له
              </Button>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground text-center">انتظر اكتمال جميع النماذج للتصويت</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export function ModelArena({ open, onOpenChange }: ModelArenaProps) {
  const [step, setStep] = useState<'select' | 'battle' | 'results'>('select');
  const [question, setQuestion] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [localResults, setLocalResults] = useState<Record<string, string>>({});
  const [doneModels, setDoneModels] = useState<Record<string, boolean>>({});
  const [votedModelId, setVotedModelId] = useState<string | null>(null);

  const { arenaStreaming, setArenaOpen, clearArenaState, arenaVoted, activeLanguage } = useChatStore();
  const { token } = useAuthStore();

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('select');
      setQuestion('');
      setSelectedModels([]);
      setLocalResults({});
      setDoneModels({});
      setVotedModelId(null);
      clearArenaState();
    }
  }, [open, clearArenaState]);

  const toggleModel = useCallback((modelId: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, modelId];
    });
  }, []);

  const startBattle = useCallback(async () => {
    if (!question.trim() || selectedModels.length < 2) return;

    setStep('battle');
    setLocalResults({});
    setDoneModels({});
    setVotedModelId(null);
    useChatStore.setState({ arenaStreaming: true });

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/chat/arena', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: question,
          models: selectedModels,
          language: activeLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(`Arena request failed: ${response.status}`);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'all_done') {
                setStep('results');
                useChatStore.setState({ arenaStreaming: false });
                continue;
              }

              if (parsed.modelId && parsed.content) {
                setLocalResults((prev) => ({
                  ...prev,
                  [parsed.modelId]: (prev[parsed.modelId] || '') + parsed.content,
                }));
              }

              if (parsed.modelId && parsed.done) {
                setDoneModels((prev) => ({
                  ...prev,
                  [parsed.modelId]: true,
                }));
                // Check if all models are done
                setDoneModels((current) => {
                  const allDone = selectedModels.every((id) => current[id]);
                  if (allDone) {
                    setStep('results');
                    useChatStore.setState({ arenaStreaming: false });
                  }
                  return current;
                });
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      }
    } catch (error) {
      console.error('[Arena] Error:', error);
      useChatStore.setState({ arenaStreaming: false });
      setStep('select');
    }
  }, [question, selectedModels, activeLanguage, token]);

  const handleVote = useCallback((modelId: string) => {
    if (votedModelId) return;
    setVotedModelId(modelId);
  }, [votedModelId]);

  const resetArena = useCallback(() => {
    setStep('select');
    setQuestion('');
    setSelectedModels([]);
    setLocalResults({});
    setDoneModels({});
    setVotedModelId(null);
    clearArenaState();
  }, [clearArenaState]);

  const allDone = selectedModels.every((id) => doneModels[id]);
  const canVote = allDone && !votedModelId;

  // Filter out non-chat models (vision-only, etc.) for arena selection
  const arenaModels = models.filter(
    (m) =>
      m.category !== 'hf-chat' &&
      m.category !== 'hf-image' &&
      m.category !== 'hf-video' &&
      m.provider !== 'huggingface'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-5xl p-0 gap-0 overflow-hidden',
          step === 'battle' || step === 'results' ? 'max-h-[90vh]' : 'max-h-[85vh]'
        )}
        showCloseButton={false}
      >
        <DialogHeader className="p-4 pb-3 border-b bg-gradient-to-l from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-gradient-to-bl from-blue-600 to-blue-500 flex items-center justify-center text-white text-sm shadow-sm">
                <Swords className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  حلبة النماذج
                  <Badge className="bg-blue-600 text-white text-[8px] px-1.5 py-0">BETA</Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  قارن ردود نماذج الذكاء الاصطناعي جنبًا إلى جنب
                </DialogDescription>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-lg hover:bg-accent transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="إغلاق"
            >
              <X className="size-5" />
            </button>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* ─── Step 1: Select Models & Question ────────────────────── */}
          {step === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
              dir="rtl"
            >
              {/* Question Input */}
              <div className="p-4 border-b">
                <label className="text-sm font-semibold text-foreground mb-2 block">
                  اكتب سؤالك
                </label>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="مثال: اشرح لي مفهوم الذكاء الاصطناعي بطريقة مبسطة..."
                  className="min-h-[80px] resize-none"
                  dir="rtl"
                />
              </div>

              {/* Model Selection */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-foreground">
                    اختر 2-3 نماذج للمقارنة
                  </label>
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedModels.length}/3 محدد
                  </Badge>
                </div>

                <ScrollArea className="h-[320px] sm:h-[380px]">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-4">
                    {arenaModels.map((model) => (
                      <ArenaModelCard
                        key={model.id}
                        model={model}
                        selected={selectedModels.includes(model.id)}
                        onToggle={() => toggleModel(model.id)}
                        disabled={selectedModels.length >= 3 && !selectedModels.includes(model.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Start Battle Button */}
              <div className="p-4 border-t bg-muted">
                <Button
                  size="lg"
                  className={cn(
                    'w-full gap-2 text-base font-bold h-12',
                    selectedModels.length >= 2 && question.trim()
                      ? 'bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg shadow-blue-500'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  )}
                  disabled={selectedModels.length < 2 || !question.trim()}
                  onClick={startBattle}
                >
                  <Swords className="size-5" />
                  ابدأ المعركة!
                </Button>
                {selectedModels.length < 2 && (
                  <p className="text-[10px] text-muted-foreground text-center mt-1">
                    اختر نموذجين على الأقل لبدء المقارنة
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ─── Step 2 & 3: Battle & Results ──────────────────────────── */}
          {(step === 'battle' || step === 'results') && (
            <motion.div
              key="battle"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
              dir="rtl"
            >
              {/* Question Banner */}
              <div className="px-4 py-3 bg-muted border-b">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-500" />
                  <p className="text-sm text-foreground font-medium line-clamp-1">{question}</p>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {selectedModels.map((id) => {
                    const m = getModelById(id);
                    return (
                      <Badge key={id} variant="secondary" className="text-[9px] px-1.5 py-0">
                        {m?.name || id}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* Response Columns */}
              <div className={cn(
                'flex-1 p-4 overflow-hidden',
                selectedModels.length === 2 ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' :
                'grid grid-cols-1 sm:grid-cols-3 gap-4'
              )}>
                {selectedModels.map((modelId) => {
                  const model = getModelById(modelId);
                  const content = localResults[modelId] || '';
                  const done = doneModels[modelId] || false;
                  const isVoted = votedModelId === modelId;
                  const voteValue = isVoted ? 1 : votedModelId && !isVoted ? 2 : undefined;

                  return (
                    <ArenaResponseColumn
                      key={modelId}
                      modelId={modelId}
                      modelName={model?.name || modelId}
                      content={content}
                      done={done}
                      vote={votedModelId ? voteValue : undefined}
                      onVote={() => handleVote(modelId)}
                      canVote={canVote}
                      voteCount={selectedModels.length}
                    />
                  );
                })}
              </div>

              {/* Results Summary / Actions */}
              {step === 'results' && (
                <div className="p-4 border-t bg-muted">
                  {votedModelId && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center gap-3 mb-3"
                    >
                      <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
                        <Trophy className="size-5 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          الفائز: {getModelById(votedModelId)?.name || votedModelId}
                        </span>
                      </div>
                    </motion.div>
                  )}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={resetArena}
                    >
                      <RotateCcw className="size-4" />
                      جولة جديدة
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => onOpenChange(false)}
                    >
                      <X className="size-4" />
                      إغلاق
                    </Button>
                  </div>
                </div>
              )}

              {/* Streaming indicator */}
              {step === 'battle' && (
                <div className="p-3 border-t bg-blue-50 dark:bg-blue-950">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                      جاري المعركة... النماذج تتنافس الآن!
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
