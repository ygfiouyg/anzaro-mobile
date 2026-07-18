'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Search, BarChart3, Brain, PenTool, Palette, FileText, ChevronDown, Sparkles, Layers, Link, HardDrive, Image, LayoutTemplate, Printer, CloudUpload } from 'lucide-react';
import { useChatStore, type StreamingProgress } from '@/store/chat-store';
import { useIsMobile } from '@/hooks/use-mobile';

// Stage definitions with icons, labels, and animation types
const STAGE_CONFIG: Record<string, {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  animationType: 'spin' | 'pulse' | 'wave' | 'typing' | 'shimmer' | 'loading';
}> = {
  searching: {
    key: 'searching',
    label: 'جاري البحث',
    icon: Search,
    animationType: 'spin',
  },
  analyzing: {
    key: 'analyzing',
    label: 'جاري التحليل',
    icon: BarChart3,
    animationType: 'pulse',
  },
  thinking: {
    key: 'thinking',
    label: 'جاري التفكير',
    icon: Brain,
    animationType: 'wave',
  },
  composing: {
    key: 'composing',
    label: 'جاري الصياغة',
    icon: PenTool,
    animationType: 'typing',
  },
  designing: {
    key: 'designing',
    label: 'جاري التصميم',
    icon: Palette,
    animationType: 'shimmer',
  },
  rendering: {
    key: 'rendering',
    label: 'جاري الرندرة',
    icon: FileText,
    animationType: 'loading',
  },
  // Batch processing stages
  extracting: {
    key: 'extracting',
    label: 'استخراج المحتوى',
    icon: Layers,
    animationType: 'loading',
  },
  'cross-analyzing': {
    key: 'cross-analyzing',
    label: 'تحليل الروابط',
    icon: Link,
    animationType: 'shimmer',
  },
  'drive_rag': {
    key: 'drive_rag',
    label: 'البحث في Google Drive',
    icon: HardDrive,
    animationType: 'loading',
  },
  initializing: {
    key: 'initializing',
    label: 'جاري التحضير',
    icon: Sparkles,
    animationType: 'pulse',
  },
  completed: {
    key: 'completed',
    label: 'تم بنجاح',
    icon: Check,
    animationType: 'pulse',
  },
  failed: {
    key: 'failed',
    label: 'فشل',
    icon: FileText,
    animationType: 'pulse',
  },
  // ─── Document Generation Stages ───
  'generating-content': {
    key: 'generating-content',
    label: 'كتابة المحتوى',
    icon: PenTool,
    animationType: 'typing',
  },
  'design-reasoning': {
    key: 'design-reasoning',
    label: 'تصميم المستند',
    icon: Palette,
    animationType: 'shimmer',
  },
  'extracting-images': {
    key: 'extracting-images',
    label: 'تجهيز الصور',
    icon: Image,
    animationType: 'loading',
  },
  'building-template': {
    key: 'building-template',
    label: 'بناء القالب',
    icon: LayoutTemplate,
    animationType: 'pulse',
  },
  uploading: {
    key: 'uploading',
    label: 'رفع على الدرايف',
    icon: CloudUpload,
    animationType: 'loading',
  },
  'doc-rendering': {
    key: 'doc-rendering',
    label: 'تحويل PDF',
    icon: Printer,
    animationType: 'loading',
  },
  // Batch document generation stage (auto after analysis)
  'generating-document': {
    key: 'generating-document',
    label: 'إنشاء المستند المجمع',
    icon: Printer,
    animationType: 'loading',
  },
};

// Ordered stages for the pipeline display
const STAGE_ORDER = ['initializing', 'extracting', 'searching', 'drive_rag', 'analyzing', 'thinking', 'cross-analyzing', 'composing', 'designing', 'rendering', 'generating-document', 'completed'];

// Document generation specific stage order
export const DOC_STAGE_ORDER = ['analyzing', 'generating-content', 'design-reasoning', 'extracting-images', 'building-template', 'doc-rendering', 'uploading', 'completed'];

// Document generation stage labels with emoji (for inline progress card)
export const DOC_STAGE_LABELS: Record<string, { emoji: string; label: string }> = {
  analyzing: { emoji: '📝', label: 'تحليل الطلب' },
  'generating-content': { emoji: '✍️', label: 'كتابة المحتوى' },
  'design-reasoning': { emoji: '🎨', label: 'تصميم المستند' },
  'extracting-images': { emoji: '🖼️', label: 'تجهيز الصور' },
  'building-template': { emoji: '📐', label: 'بناء القالب' },
  'doc-rendering': { emoji: '🖨️', label: 'تحويل PDF' },
  uploading: { emoji: '☁️', label: 'رفع على الدرايف' },
  completed: { emoji: '✅', label: 'جاهز!' },
};

// Default fallback stages when no progress events received
const FALLBACK_STAGES = [
  { key: 'thinking', label: 'جاري التفكير', icon: Brain, animationType: 'wave' as const },
  { key: 'composing', label: 'جاري صياغة الرد', icon: PenTool, animationType: 'typing' as const },
];

// Animated icon wrapper — each stage gets a unique animation
function AnimatedStageIcon({
  stageKey,
  isActive,
  isCompleted,
}: {
  stageKey: string;
  isActive: boolean;
  isCompleted: boolean;
}) {
  const config = STAGE_CONFIG[stageKey];
  const Icon = config?.icon || Brain;

  if (isCompleted) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="flex items-center justify-center size-6 rounded-full bg-blue-500 text-white"
      >
        <Check className="size-3.5" />
      </motion.div>
    );
  }

  if (!isActive) {
    return (
      <div className="flex items-center justify-center size-6 rounded-full bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
    );
  }

  // Active stage — apply specific animation
  const animationType = config?.animationType || 'pulse';

  return (
    <div className="relative flex items-center justify-center size-6">
      {/* Background ring animation */}
      <motion.div
        className="absolute inset-0 rounded-full bg-blue-500"
        animate={
          animationType === 'pulse'
            ? { scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }
            : animationType === 'wave'
              ? { scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }
              : animationType === 'shimmer'
                ? { opacity: [0.2, 0.5, 0.2] }
                : { rotate: 360 }
        }
        transition={
          animationType === 'spin' || animationType === 'loading'
            ? { duration: 1.5, repeat: Infinity, ease: 'linear' }
            : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
        }
      />

      <motion.div
        className="relative flex items-center justify-center size-6 rounded-full bg-blue-500 text-white"
        animate={
          animationType === 'wave'
            ? { y: [0, -2, 0, 2, 0] }
            : animationType === 'typing'
              ? { scale: [1, 1.1, 1] }
              : {}
        }
        transition={
          animationType === 'wave'
            ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
            : animationType === 'typing'
              ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
              : {}
        }
      >
        <Icon className="size-3.5" />
      </motion.div>
    </div>
  );
}

// Typing dots animation for compact mode
function TypingDots() {
  return (
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
  );
}

// Shimmer line animation for the progress bar
function ShimmerBar() {
  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-l from-blue-400 via-blue-500 to-blue-400"
        initial={{ x: '100%' }}
        animate={{ x: '-100%' }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ width: '60%' }}
      />
    </div>
  );
}

// Compute elapsed time for a stage
function formatElapsedTime(startTime: number): string {
  const diff = Date.now() - startTime;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
}

// Compute stage duration from history
function getStageDuration(
  history: Array<{ stage: string; detail: string; timestamp: number }>,
  index: number
): string | null {
  const currentTimestamp = history[index]?.timestamp;
  const nextTimestamp = history[index + 1]?.timestamp;
  if (!currentTimestamp || !nextTimestamp) return null;
  const diff = nextTimestamp - currentTimestamp;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
}

export function ProgressIndicator() {
  const { isStreaming, streamingProgress } = useChatStore();
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const stageStartTimeRef = useRef<number>(0);
  // Tick counter to force re-renders for elapsed time display
  const [tick, setTick] = useState(0);

  // Track when streaming starts / stage changes
  // FIX: use state instead of ref so render can read it safely (was refs-during-render error)
  const prevStageRef = useRef<string | null>(null);
  const [stageStartTime, setStageStartTime] = useState(0);
  useEffect(() => {
    if (isStreaming && prevStageRef.current !== (streamingProgress?.stage || 'thinking')) {
      const now = Date.now();
      stageStartTimeRef.current = now;
      setStageStartTime(now);
      prevStageRef.current = streamingProgress?.stage || 'thinking';
    }
    if (!isStreaming && prevStageRef.current !== null) {
      prevStageRef.current = null;
      stageStartTimeRef.current = 0;
      setStageStartTime(0);
    }
  }, [isStreaming, streamingProgress?.stage]);

  // Determine which stages to show based on progress events received
  const visibleStages = useMemo(() => {
    if (!streamingProgress) {
      return FALLBACK_STAGES;
    }

    const allStages = [...streamingProgress.history.map((h) => h.stage), streamingProgress.stage];
    const uniqueStages = [...new Set(allStages)];

    const currentIdx = STAGE_ORDER.indexOf(streamingProgress.stage);
    if (currentIdx >= 0) {
      return STAGE_ORDER.slice(0, currentIdx + 1)
        .map((key) => STAGE_CONFIG[key])
        .filter(Boolean);
    }

    return uniqueStages
      .map((key) => STAGE_CONFIG[key])
      .filter(Boolean);
  }, [streamingProgress]);

  // Current stage info
  const currentStage = streamingProgress?.stage || 'thinking';
  const currentDetail = streamingProgress?.detail || 'جاري صياغة الرد...';

  // Update tick every 500ms while streaming for elapsed time display
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Reset expanded when streaming stops (via the interval callback, not direct setState in effect)
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (!isStreaming && prevStreamingRef.current) {
      // Streaming just ended — schedule collapse
      const timer = setTimeout(() => setIsExpanded(false), 0);
      return () => clearTimeout(timer);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Compute elapsed time string (reads state, not ref — safe during render)
  const elapsedTime = isStreaming && stageStartTime
    ? formatElapsedTime(stageStartTime)
    : '';

  const handleMouseEnter = useCallback(() => {
    if (!isMobile && isStreaming) setIsExpanded(true);
  }, [isMobile, isStreaming]);

  const handleMouseLeave = useCallback(() => {
    if (!isMobile) setIsExpanded(false);
  }, [isMobile]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!isStreaming) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' as const }}
        className="overflow-hidden"
        dir="rtl"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="relative bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800">
          {/* Shimmer progress bar at top */}
          <ShimmerBar />

          {/* Compact Mode — Single line */}
          <AnimatePresence mode="wait">
            {!isExpanded ? (
              <motion.div
                key="compact"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 px-4 py-2 cursor-pointer select-none"
                onClick={toggleExpanded}
              >
                {/* Animated icon */}
                <AnimatedStageIcon
                  stageKey={currentStage}
                  isActive={true}
                  isCompleted={false}
                />

                {/* Stage detail text */}
                <span className="text-xs text-blue-700 dark:text-blue-300 font-medium truncate flex-1">
                  {currentDetail}
                </span>

                {/* Elapsed time */}
                {elapsedTime && (
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 font-mono tabular-nums">
                    {elapsedTime}
                  </span>
                )}

                {/* Typing dots */}
                <TypingDots />

                {/* Expand chevron */}
                <motion.div
                  animate={{ rotate: 0 }}
                  className="text-blue-400 dark:text-blue-500"
                >
                  <ChevronDown className="size-3.5" />
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' as const }}
                className="px-4 py-3"
              >
                {/* Header with current stage */}
                <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={toggleExpanded}>
                  <AnimatedStageIcon
                    stageKey={currentStage}
                    isActive={true}
                    isCompleted={false}
                  />
                  <span className="text-sm text-blue-700 dark:text-blue-300 font-semibold flex-1">
                    {currentDetail}
                  </span>
                  {elapsedTime && (
                    <span className="text-xs text-blue-500 dark:text-blue-400 font-mono tabular-nums bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">
                      {elapsedTime}
                    </span>
                  )}
                  <motion.div
                    animate={{ rotate: 180 }}
                    transition={{ duration: 0.2 }}
                    className="text-blue-400 dark:text-blue-500"
                  >
                    <ChevronDown className="size-3.5" />
                  </motion.div>
                </div>

                {/* Stage Pipeline */}
                <div className="flex flex-col gap-1">
                  {visibleStages.map((stage, idx) => {
                    const isCurrent = stage.key === currentStage;
                    const isCompleted = streamingProgress
                      ? streamingProgress.history.some((h) => h.stage === stage.key) && !isCurrent
                      : false;

                    const historyEntry = streamingProgress?.history.find(
                      (h, hIdx) => h.stage === stage.key && hIdx === idx
                    );
                    const stageDuration = streamingProgress
                      ? getStageDuration(streamingProgress.history, idx)
                      : null;

                    return (
                      <motion.div
                        key={stage.key}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className={`flex items-center gap-2.5 py-1 px-2 rounded-md transition-colors ${
                          isCurrent
                            ? 'bg-blue-100 dark:bg-blue-900'
                            : isCompleted
                              ? 'bg-blue-50 dark:bg-blue-950'
                              : ''
                        }`}
                      >
                        <AnimatedStageIcon
                          stageKey={stage.key}
                          isActive={isCurrent}
                          isCompleted={isCompleted}
                        />

                        <span
                          className={`text-xs font-medium flex-1 ${
                            isCurrent
                              ? 'text-blue-700 dark:text-blue-300'
                              : isCompleted
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {isCompleted ? (historyEntry?.detail || stage.label) : stage.label}
                        </span>

                        {/* Stage duration (completed stages) */}
                        {isCompleted && stageDuration && (
                          <span className="text-[10px] text-blue-500 dark:text-blue-400 font-mono tabular-nums">
                            {stageDuration}
                          </span>
                        )}

                        {/* Current stage: animated dots */}
                        {isCurrent && <TypingDots />}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Progress bar (overall) */}
                <div className="mt-3 h-1 rounded-full bg-blue-200 dark:bg-blue-800 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-blue-500"
                    initial={{ width: '0%' }}
                    animate={{
                      width: `${Math.min(
                        ((streamingProgress?.history.length || 0) / Math.max(STAGE_ORDER.length, 1)) * 100,
                        90
                      )}%`,
                    }}
                    transition={{ duration: 0.6, ease: 'easeOut' as const }}
                  />
                </div>

                {/* Stage counter */}
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-blue-500 dark:text-blue-400">
                    {streamingProgress
                      ? `المرحلة ${(streamingProgress.history.length || 0) + 1} من ${STAGE_ORDER.length}`
                      : 'جاري المعالجة...'}
                  </span>
                  {streamingProgress?.history?.length ? (
                    <span className="text-[10px] text-blue-500 dark:text-blue-400">
                      {streamingProgress.history.length} مرحلة مكتملة
                    </span>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// A more dynamic version that accepts custom stage text
// (kept for backward compatibility)
export function ProgressIndicatorCustom({
  isVisible,
  stageText,
  stageEmoji = '⏳',
}: {
  isVisible: boolean;
  stageText: string;
  stageEmoji?: string;
}) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' as const }}
          className="overflow-hidden"
          dir="rtl"
        >
          <div className="flex items-center gap-2 px-4 py-1.5 border-b relative bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <ShimmerBar />
            <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
              {stageEmoji} {stageText}
            </span>
            <TypingDots />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
