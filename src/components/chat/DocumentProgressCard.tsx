'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Terminal } from 'lucide-react';
import { DOC_STAGE_ORDER, DOC_STAGE_LABELS } from './ProgressIndicator';
import type { DocumentGenProgress } from '@/store/chat-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DocumentProgressCardProps {
  progress: DocumentGenProgress;
  /** Whether a cancel action is available */
  onCancel?: () => void;
  /** Start time for ETA calculation */
  startTime?: number;
}

/** Format seconds into Arabic-friendly duration */
function formatETA(seconds: number): string {
  // FIX L7: Handle Infinity and NaN cases
  if (!isFinite(seconds) || seconds < 0) return '...';
  if (seconds < 60) return `~${Math.ceil(seconds)} ثانية`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  if (remainingSeconds === 0) return `~${minutes} دقيقة`;
  return `~${minutes} دقيقة و ${remainingSeconds} ثانية`;
}

/** Get icon/color for a trace log stage */
function getTraceEntryStyle(stage: string): { emoji: string; colorClass: string } {
  const labels = DOC_STAGE_LABELS[stage];
  if (labels) return { emoji: labels.emoji, colorClass: 'text-blue-600 dark:text-blue-400' };
  if (stage === 'completed') return { emoji: '✅', colorClass: 'text-blue-600 dark:text-blue-400' };
  if (stage === 'error') return { emoji: '❌', colorClass: 'text-red-600 dark:text-red-400' };
  return { emoji: '⏳', colorClass: 'text-blue-600 dark:text-blue-400' };
}

export function DocumentProgressCard({ progress, onCancel, startTime }: DocumentProgressCardProps) {
  const { stage, progress: percent, detail, history } = progress;
  const traceEndRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  // Compute which stages are completed, active, or pending
  const currentIdx = DOC_STAGE_ORDER.indexOf(stage);
  const isValidStage = currentIdx >= 0;

  // Stages to display
  const visibleStages = isValidStage
    ? DOC_STAGE_ORDER.slice(0, currentIdx + 1)
    : [stage];

  // ETA calculation
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    if (!startTime || percent <= 0 || percent >= 100) {
      setEta(null);
      return;
    }

    const calculateETA = () => {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const rate = percent / elapsed; // % per second
      const remaining = (100 - percent) / rate; // seconds remaining
      return formatETA(remaining);
    };

    setEta(calculateETA());

    // Update ETA every 2 seconds
    const interval = setInterval(() => {
      setEta(calculateETA());
      setTick((t) => t + 1); // force re-render
    }, 2000);

    return () => clearInterval(interval);
  }, [startTime, percent, tick]);

  // Auto-scroll trace log
  useEffect(() => {
    if (traceEndRef.current) {
      traceEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history.length, stage, detail]);

  // Build trace entries from history + current stage
  const traceEntries = [
    ...history.map((h) => ({
      timestamp: h.timestamp,
      stage: h.stage,
      detail: h.detail,
    })),
    {
      timestamp: Date.now(),
      stage,
      detail,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950 overflow-hidden"
      dir="rtl"
    >
      {/* Header with shimmer */}
      <div className="relative px-4 py-3 border-b border-blue-200 dark:border-blue-800">
        {/* Shimmer bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-l from-blue-400 via-blue-500 to-blue-400"
            initial={{ x: '100%' }}
            animate={{ x: '-100%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '60%' }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-lg">
            {DOC_STAGE_LABELS[stage]?.emoji || '⏳'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 truncate">
              {DOC_STAGE_LABELS[stage]?.label || detail || 'جاري الإنشاء...'}
            </p>
            {detail && DOC_STAGE_LABELS[stage] && detail !== DOC_STAGE_LABELS[stage].label && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 truncate mt-0.5">
                {detail}
              </p>
            )}
          </div>

          {/* Percentage badge */}
          <div className="flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full">
            <motion.span
              key={Math.floor(percent)}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="text-xs font-bold text-blue-700 dark:text-blue-300 tabular-nums"
            >
              {Math.round(percent)}%
            </motion.span>
          </div>

          {/* Cancel button */}
          {onCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 rounded-full text-blue-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={onCancel}
              aria-label="إلغاء الإنشاء"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-blue-200 dark:bg-blue-800 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-blue-400 to-blue-500"
            initial={{ width: '0%' }}
            animate={{ width: `${Math.min(percent, 95)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>

        {/* ETA row */}
        {eta && percent < 100 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <Clock className="size-3 text-blue-500 dark:text-blue-400" />
            <span className="text-[10px] text-blue-600 dark:text-blue-400 tabular-nums">
              الوقت المتبقي: {eta}
            </span>
          </div>
        )}
      </div>

      {/* Stage pipeline */}
      <div className="px-4 py-2.5 space-y-1">
        {visibleStages.map((stageKey, idx) => {
          const isCurrent = stageKey === stage;
          const isCompleted = history.some((h) => h.stage === stageKey) && !isCurrent;
          const stageLabel = DOC_STAGE_LABELS[stageKey];
          const historyEntry = history.find((h) => h.stage === stageKey);

          return (
            <motion.div
              key={stageKey}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
              className={`flex items-center gap-2 py-1 px-2 rounded-md transition-colors ${
                isCurrent
                  ? 'bg-blue-100 dark:bg-blue-900'
                  : isCompleted
                    ? 'bg-blue-50 dark:bg-blue-950'
                    : ''
              }`}
            >
              {/* Stage indicator */}
              {isCompleted ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center justify-center size-5 rounded-full bg-blue-500 text-white flex-shrink-0"
                >
                  <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              ) : isCurrent ? (
                <div className="relative flex items-center justify-center size-5 flex-shrink-0">
                  <motion.div
                    className="absolute inset-0 rounded-full bg-blue-500"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="relative flex items-center justify-center size-5 rounded-full bg-blue-500 text-white">
                    <span className="text-[10px]">{stageLabel?.emoji || '⏳'}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center size-5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  <span className="text-[10px] opacity-50">{stageLabel?.emoji || '⏳'}</span>
                </div>
              )}

              {/* Stage label */}
              <span
                className={`text-xs font-medium flex-1 ${
                  isCurrent
                    ? 'text-blue-700 dark:text-blue-300'
                    : isCompleted
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-muted-foreground'
                }`}
              >
                {isCompleted && historyEntry?.detail
                  ? historyEntry.detail
                  : stageLabel?.label || stageKey}
              </span>

              {/* Current stage indicator */}
              {isCurrent && (
                <div className="flex items-center gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-1 rounded-full bg-blue-500"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Backend trace log */}
      {traceEntries.length > 0 && (
        <div className="mx-4 mb-3 rounded-md bg-blue-50 dark:bg-blue-950 dark:bg-blue-50 dark:bg-blue-950 border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border">
            <Terminal className="size-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium">سجل العمليات</span>
            <span className="text-[9px] text-muted-foreground mr-auto tabular-nums">
              {traceEntries.length} خطوة
            </span>
          </div>
          <div className="max-h-28 overflow-y-auto px-2.5 py-1.5 space-y-0.5 custom-scrollbar">
            {traceEntries.map((entry, idx) => {
              const style = getTraceEntryStyle(entry.stage);
              const isLatest = idx === traceEntries.length - 1;
              return (
                <motion.div
                  key={`${entry.timestamp}-${idx}`}
                  initial={isLatest ? { opacity: 0, x: -4 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    'flex items-start gap-1.5 text-[10px] font-mono',
                    isLatest ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  dir="ltr"
                >
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {new Date(entry.timestamp).toLocaleTimeString('en', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span className={cn('shrink-0', style.colorClass)}>{style.emoji}</span>
                  <span className="break-all">{entry.detail || entry.stage}</span>
                </motion.div>
              );
            })}
            <div ref={traceEndRef} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
