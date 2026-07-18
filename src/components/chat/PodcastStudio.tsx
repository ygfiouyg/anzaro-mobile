'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Headphones, Sparkles, Loader2, Play, Pause, Volume2,
  Download, ChevronDown, ChevronUp, FileText, Mic,
  Clock, CheckCircle2, AlertTriangle,
  RotateCcw, BookOpen, Upload, Trash2, Zap,
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────
interface PodcastResult {
  title: string;
  script: string;
  intro?: string;
  segments?: string[];
  outro?: string;
}

type GenerationStep = 'idle' | 'script' | 'audio' | 'done';

interface PodcastStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
}

// ─── Audio Player Component ───────────────────────────────────────────
function AudioPlayer({ audioBlob, duration, compact }: { audioBlob: Blob; duration: number; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);

  // Create object URL from blob — useMemo avoids cascading renders from useEffect+setState
  const src = useMemo(() => audioBlob ? URL.createObjectURL(audioBlob) : '', [audioBlob]);
  useEffect(() => {
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      setIsLoading(false);
    };
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => { setPlaybackError(true); setIsLoading(false); };
    const handleCanPlay = () => setIsLoading(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playbackError) return;
    if (isPlaying) { audio.pause(); } else { audio.play().catch(() => setPlaybackError(true)); }
    setIsPlaying(!isPlaying);
  }, [isPlaying, playbackError]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration || playbackError) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    audio.currentTime = (x / rect.width) * audioDuration;
  };

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const progressPercent = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  const handleDownload = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = 'podcast.wav';
    a.click();
    toast.success('تم بدء تحميل البودكاست');
  };

  if (playbackError) {
    return (
      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-blue-600 dark:text-blue-400" />
          <p className="text-xs text-blue-700 dark:text-blue-300">لم يتم تشغيل الصوت في المتصفح</p>
        </div>
        <Button onClick={handleDownload} variant="outline" size="sm" className="mt-2 text-xs">
          <Download className="size-3 ml-1" /> تحميل الملف الصوتي
        </Button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <audio ref={audioRef} src={src} preload="metadata" />
        <motion.button
          onClick={togglePlay}
          disabled={isLoading}
          className={cn(
            'flex-shrink-0 size-8 rounded-full flex items-center justify-center transition-colors',
            isLoading ? 'bg-blue-200 dark:bg-blue-900 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
          whileTap={!isLoading ? { scale: 0.9 } : {}}
        >
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 mr-[-1px]" />}
        </motion.button>
        <span className="text-[10px] text-muted-foreground">{formatTime(audioDuration)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="p-4 rounded-xl bg-gradient-to-l from-blue-50 to-background dark:from-blue-950 dark:to-background border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-3">
          <motion.button
            onClick={togglePlay}
            disabled={isLoading}
            className={cn(
              'flex-shrink-0 size-12 rounded-full flex items-center justify-center transition-colors shadow-md',
              isLoading ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-wait'
                : 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
            )}
            whileHover={!isLoading ? { scale: 1.08 } : {}}
            whileTap={!isLoading ? { scale: 0.92 } : {}}
          >
            {isLoading ? <Loader2 className="size-5 animate-spin" /> : isPlaying ? <Pause className="size-5" /> : <Play className="size-5 mr-[-2px]" />}
          </motion.button>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="relative h-2.5 bg-blue-100 dark:bg-blue-900 rounded-full cursor-pointer overflow-hidden" onClick={handleSeek}>
              <motion.div
                className="absolute inset-y-0 right-0 bg-gradient-to-l from-blue-500 to-blue-400 rounded-full"
                initial={false}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(audioDuration)}</span>
            </div>
          </div>
          <button onClick={handleDownload} className="flex-shrink-0 p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors text-blue-600 dark:text-blue-400" aria-label="تحميل">
            <Download className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress Indicator ───────────────────────────────────────────────
function GenerationProgress({ step, audioProgress }: { step: GenerationStep; audioProgress: number }) {
  const steps = [
    { key: 'script', label: 'توليد السكريبت', icon: FileText },
    { key: 'audio', label: 'تحويل لصوت', icon: Mic },
    { key: 'done', label: 'اكتمل', icon: CheckCircle2 },
  ];
  const currentIdx = step === 'idle' ? -1 : steps.findIndex((s) => s.key === step);

  return (
    <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-bl from-blue-50 to-background dark:from-blue-950 dark:to-background">
      <div className="flex items-center gap-2 mb-3">
        <Headphones className="size-5 text-blue-600 dark:text-blue-400" />
        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">جاري إنشاء البودكاست</p>
      </div>
      <div className="space-y-2">
        {steps.map((s, idx) => {
          const isCompleted = currentIdx > idx;
          const isCurrent = currentIdx === idx;
          const Icon = s.icon;
          return (
            <div key={s.key} className={cn(
              'flex items-center gap-3 p-2 rounded-lg transition-all',
              isCurrent && 'bg-blue-100 dark:bg-blue-900'
            )}>
              {isCompleted ? <CheckCircle2 className="size-4 text-blue-500" /> :
               isCurrent ? <Loader2 className="size-4 text-blue-500 animate-spin" /> :
               <div className="size-4 rounded-full border-2 border-muted-foreground" />}
              <Icon className={cn('size-3.5', isCompleted ? 'text-blue-500' : isCurrent ? 'text-blue-500' : 'text-muted-foreground')} />
              <span className={cn('text-xs font-semibold', isCompleted ? 'text-blue-600' : isCurrent ? 'text-blue-700' : 'text-muted-foreground')}>
                {s.label}
              </span>
              {isCurrent && s.key === 'audio' && audioProgress > 0 && (
                <div className="flex-1 bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${audioProgress}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────
export function PodcastStudio({ open, onOpenChange, initialContent }: PodcastStudioProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [voice, setVoice] = useState<'male' | 'female'>('male');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState<GenerationStep>('idle');
  const [podcastResult, setPodcastResult] = useState<PodcastResult | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  // Test Audio states
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [testAudioBlob, setTestAudioBlob] = useState<Blob | null>(null);
  const [testAudioError, setTestAudioError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set initial content from props
  useEffect(() => {
    if (initialContent && open) setContent(initialContent);
  }, [initialContent, open]);

  // ─── Test Audio ────────────────────────────────────────────────────
  const handleTestAudio = useCallback(async () => {
    setIsTestingAudio(true);
    setTestAudioBlob(null);
    setTestAudioError(null);

    const testText = 'مرحبا، هذا اختبار للصوت. إذا كنت تسمع هذا، فالصوت يعمل بشكل صحيح.';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch('/api/ai/tts/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText, voice, speed: 1.0 }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'فشل');
        }
        throw new Error(`خطأ HTTP: ${response.status}`);
      }

      // Parse as ArrayBuffer → wrap in Blob with explicit audio/wav type
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > 100) {
        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        setTestAudioBlob(blob);
        toast.success('الصوت يعمل! اضغط تشغيل للاستماع ✅');
      } else {
        throw new Error('الصوت المولد فارغ');
      }
    } catch (err) {
      const msg = err instanceof Error
        ? err.name === 'AbortError' ? 'انتهت المهلة - السيرفر بطيء' : err.message
        : 'فشل في اختبار الصوت';
      setTestAudioError(msg);
      toast.error(`اختبار الصوت فشل: ${msg}`);
    } finally {
      setIsTestingAudio(false);
    }
  }, [voice]);

  // ─── File Upload Handler ───────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('حجم الملف أكبر من 5 ميجابايت');
      return;
    }

    setFileName(file.name);

    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const text = await file.text();
        setContent(prev => prev ? prev + '\n\n' + text : text);
        toast.success('تم تحميل الملف النصي');
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/files/extract-text', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setContent(prev => prev ? prev + '\n\n' + data.text : data.text);
          toast.success('تم استخراج النص من PDF');
        } else {
          toast.error('فشل في استخراج النص من PDF');
        }
      } else {
        // Try as plain text
        const text = await file.text();
        if (text.trim()) {
          setContent(prev => prev ? prev + '\n\n' + text : text);
          toast.success('تم تحميل الملف');
        } else {
          toast.error('نوع الملف غير مدعوم. استخدم TXT أو PDF');
        }
      }
    } catch {
      toast.error('فشل في قراءة الملف');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ─── Generate Podcast ────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!title.trim()) { toast.error('يرجى إدخال عنوان البودكاست'); return; }
    if (!content.trim()) { toast.error('يرجى إدخال المحتوى أو رفع ملف'); return; }

    setIsGenerating(true);
    setPodcastResult(null);
    setAudioBlob(null);
    setAudioDuration(0);
    setAudioError(null);
    setAudioProgress(0);
    setGenStep('script');

    try {
      // Step 1: Generate Script
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const scriptResponse = await fetch('/api/ai/podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), voice, language: 'ar' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!scriptResponse.ok) {
        const errorData = await scriptResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'فشل في إنشاء سكريبت البودكاست');
      }

      const scriptData: PodcastResult = await scriptResponse.json();
      setPodcastResult(scriptData);
      setGenStep('audio');

      // Step 2: Generate Audio via TTS
      if (scriptData.script && scriptData.script.trim()) {
        try {
          setAudioProgress(5);
          const audioController = new AbortController();
          const audioTimeoutId = setTimeout(() => audioController.abort(), 120_000); // 2 min for TTS

          const progressInterval = setInterval(() => {
            setAudioProgress(prev => Math.min(prev + 5, 85));
          }, 3000);

          const audioResponse = await fetch('/api/ai/tts/edge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: scriptData.script, voice, speed: voice === 'female' ? 0.95 : 1.0 }),
            signal: audioController.signal,
          });

          clearInterval(progressInterval);
          clearTimeout(audioTimeoutId);

          if (!audioResponse.ok) {
            const contentType = audioResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await audioResponse.json().catch(() => ({}));
              throw new Error(errorData.error || 'فشل في توليد الصوت');
            }
            throw new Error(`خطأ في توليد الصوت: ${audioResponse.status}`);
          }

          setAudioProgress(90);
          // Parse as ArrayBuffer → wrap in Blob with explicit audio/wav type
          const audioArrayBuffer = await audioResponse.arrayBuffer();
          setAudioProgress(100);

          const duration = parseInt(audioResponse.headers.get('X-Audio-Duration') || '0', 10);

          if (audioArrayBuffer.byteLength > 1000) {
            const blob = new Blob([audioArrayBuffer], { type: 'audio/wav' });
            setAudioBlob(blob);
            setAudioDuration(duration || Math.round(blob.size / 32000));
            toast.success('تم إنشاء البودكاست بنجاح! 🎙️');
          } else {
            setAudioError('الصوت المولد فارغ أو صغير جداً');
            toast.success('تم إنشاء السكريبت! (الصوت غير متاح)');
          }
        } catch (ttsError) {
          const msg = ttsError instanceof Error
            ? ttsError.name === 'AbortError' ? 'انتهت مهلة توليد الصوت' : ttsError.message
            : 'فشل في توليد الصوت';
          setAudioError(msg);
          toast.success('تم إنشاء السكريبت! (الصوت غير متاح حالياً)');
        }
      }

      setGenStep('done');
    } catch (error) {
      const msg = error instanceof Error
        ? error.name === 'AbortError' ? 'انتهت مهلة الطلب' : error.message
        : 'فشل في إنشاء البودكاست';
      toast.error(msg);
      setGenStep('idle');
    } finally {
      setIsGenerating(false);
    }
  }, [title, content, voice]);

  // ─── Close Handler ────────────────────────────────────────────────
  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setTimeout(() => {
        setPodcastResult(null);
        setTitle('');
        setContent('');
        setVoice('male');
        setGenStep('idle');
        setShowScript(false);
        setAudioBlob(null);
        setAudioDuration(0);
        setAudioError(null);
        setAudioProgress(0);
        setFileName(null);
        setTestAudioBlob(null);
        setTestAudioError(null);
      }, 300);
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  const contentLength = content.length;
  const hasAudio = !!audioBlob;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center size-8 rounded-lg bg-blue-100 dark:bg-blue-950">
              <Headphones className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            بودكاست ذكي
          </DialogTitle>
          <DialogDescription>
            حوّل أي محتوى أو ملف إلى بودكاست صوتي بالذكاء الاصطناعي
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ─── Input Section ─── */}
          {!podcastResult && !isGenerating && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

              {/* Title + Voice row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Mic className="size-3.5 text-blue-500" />
                    عنوان البودكاست *
                  </Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: مقدمة في الذكاء الاصطناعي"
                    dir="auto"
                    className="text-sm h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Volume2 className="size-3.5 text-blue-500" />
                    الصوت
                  </Label>
                  <Select value={voice} onValueChange={(v: 'male' | 'female') => setVoice(v)}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">🎙️ ذكر — واثق</SelectItem>
                      <SelectItem value="female">🎤 أنثى — دافئ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Content area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <BookOpen className="size-3.5 text-blue-500" />
                    المحتوى *
                  </Label>
                  <div className="flex items-center gap-2">
                    {fileName && (
                      <Badge variant="secondary" className="text-[9px] gap-1">
                        <FileText className="size-2.5" />
                        {fileName.slice(0, 20)}
                        <button onClick={() => { setFileName(null); }} className="hover:text-destructive">
                          <Trash2 className="size-2.5" />
                        </button>
                      </Badge>
                    )}
                    <span className={cn('text-[10px] font-mono', contentLength > 3000 ? 'text-blue-500' : 'text-muted-foreground')}>
                      {contentLength.toLocaleString()} حرف
                    </span>
                  </div>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="الصق المحتوى الذي تريد تحويله إلى بودكاست... أو ارفع ملف من الأسفل"
                  rows={5}
                  dir="auto"
                  className="text-sm resize-none"
                />
              </div>

              {/* File Upload + Test Audio + Generate */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Upload file button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 text-xs gap-1.5"
                >
                  <Upload className="size-3.5" />
                  رفع ملف
                </Button>

                {/* Test Audio button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestAudio}
                  disabled={isTestingAudio}
                  className={cn(
                    'h-9 text-xs gap-1.5',
                    testAudioBlob && 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400',
                    testAudioError && 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400'
                  )}
                >
                  {isTestingAudio ? (
                    <><Loader2 className="size-3.5 animate-spin" /> اختبار الصوت...</>
                  ) : testAudioBlob ? (
                    <><Zap className="size-3.5" /> الصوت يعمل ✅</>
                  ) : testAudioError ? (
                    <><AlertTriangle className="size-3.5" /> الصوت لا يعمل</>
                  ) : (
                    <><Zap className="size-3.5" /> اختبار الصوت</>
                  )}
                </Button>

                {/* Generate button */}
                <div className="flex-1" />
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !title.trim() || !content.trim()}
                    className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white h-9 px-5 text-sm font-semibold"
                  >
                    <Sparkles className="size-4 ml-2" />
                    توليد البودكاست
                  </Button>
                </motion.div>
              </div>

              {/* Test Audio Result */}
              <AnimatePresence>
                {testAudioBlob && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="size-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                          الصوت يعمل بنجاح! اضغط تشغيل للاستماع:
                        </span>
                      </div>
                      <AudioPlayer audioBlob={testAudioBlob} duration={0} compact />
                    </div>
                  </motion.div>
                )}
                {testAudioError && !testAudioBlob && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
                        <div>
                          <p className="text-xs font-semibold text-red-700 dark:text-red-300">الصوت لا يعمل</p>
                          <p className="text-[10px] text-red-600 dark:text-red-400">{testAudioError}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ─── Generation Progress ─── */}
          <AnimatePresence>
            {isGenerating && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <GenerationProgress step={genStep} audioProgress={audioProgress} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Result ─── */}
          <AnimatePresence>
            {podcastResult && !isGenerating && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">

                {/* Header */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <CheckCircle2 className="size-5 text-blue-600 dark:text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                      {hasAudio ? 'تم إنشاء البودكاست بنجاح!' : 'تم إنشاء السكريبت!'}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 truncate">{podcastResult.title}</p>
                  </div>
                  {audioDuration > 0 && (
                    <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                      <Clock className="size-3 ml-1" />
                      {Math.floor(audioDuration / 60)}:{(audioDuration % 60).toString().padStart(2, '0')}
                    </Badge>
                  )}
                </div>

                {/* Audio Player */}
                {hasAudio && <AudioPlayer audioBlob={audioBlob} duration={audioDuration} />}

                {/* Audio Error */}
                {audioError && !hasAudio && (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">لم يتم توليد الصوت</p>
                        <p className="text-[10px] text-blue-600 dark:text-blue-400">{audioError}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Script */}
                {podcastResult.script && (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowScript(!showScript)}
                      className="w-full flex items-center justify-between p-3 hover:bg-accent transition-colors"
                    >
                      <span className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="size-4 text-blue-500" />
                        سكريبت البودكاست
                        <Badge variant="secondary" className="text-[9px]">{podcastResult.script.split(/\s+/).length} كلمة</Badge>
                      </span>
                      {showScript ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                    </button>
                    <AnimatePresence>
                      {showScript && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="p-3 pt-0 max-h-72 overflow-y-auto custom-scrollbar space-y-3">
                            {podcastResult.intro && (
                              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1">🎙️ المقدمة</p>
                                <p className="text-sm leading-relaxed text-foreground">{podcastResult.intro}</p>
                              </div>
                            )}
                            {podcastResult.segments?.map((segment, idx) => (
                              <div key={idx} className="p-2.5 rounded-lg bg-muted border border-border">
                                <p className="text-[10px] font-bold text-muted-foreground mb-1">📌 الفقرة {idx + 1}</p>
                                <p className="text-sm leading-relaxed text-foreground">{segment}</p>
                              </div>
                            ))}
                            {podcastResult.outro && (
                              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1">🏁 الخاتمة</p>
                                <p className="text-sm leading-relaxed text-foreground">{podcastResult.outro}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setPodcastResult(null); setGenStep('idle'); setAudioBlob(null); setAudioDuration(0); setAudioError(null); }} className="flex-1 text-xs">
                    <RotateCcw className="size-3.5 ml-1" /> بودكاست جديد
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
