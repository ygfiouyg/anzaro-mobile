'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Loader2,
  Download,
  X,
  RefreshCw,
  ImageIcon,
  Clock,
  FileDown,
  Upload,
  Check,
  BookOpen,
  BarChart3,
  PenTool,
  FileSearch,
  Trash2,
  Plus,
  Sparkles,
  Brain,
  Palette,
  Terminal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import {
  DOCUMENT_MODELS,
  getDocumentModelById,
  type DocumentModelEntry,
  type DocumentType,
} from '@/lib/document-models';
// Design templates import removed — AI-driven dynamic design replaces fixed templates
// The design-templates.ts module is kept for backward-compat fallback only
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Props ────────────────────────────────────────────────────────────

interface DocumentGenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill prompt when triggered from chat commands like /ملف or /ملخص */
  initialPrompt?: string;
  /** Pre-select mode: 'single' or 'batch' */
  initialMode?: 'single' | 'batch';
  /** Whether triggered from /ملفاتي command (unified file generation) */
  isMyFiles?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────

/** Templates available for slide-deck-ai */
const SLIDE_DECK_TEMPLATES = [
  { value: 'Basic', label: 'أساسي' },
  { value: 'Minimalist', label: 'بسيط' },
  { value: 'Professional', label: 'احترافي' },
  { value: 'Creative', label: 'إبداعي' },
  { value: 'Elegant', label: 'أنيق' },
  { value: 'Modern', label: 'عصري' },
];

/** Language options */
const LANGUAGES = [
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
];

/** Group models by document type for the selector */
const MODEL_GROUPS: {
  type: DocumentType;
  icon: string;
  labelAr: string;
  models: DocumentModelEntry[];
}[] = [
  {
    type: 'pdf',
    icon: '🚀',
    labelAr: 'مستندات PDF محلية (سريع وموثوق)',
    models: Object.values(DOCUMENT_MODELS).filter((m) => m.type === 'pdf' && m.id === 'local-pdf' && m.available),
  },
  {
    type: 'pdf',
    icon: '📄',
    labelAr: 'مستندات PDF خارجية',
    models: Object.values(DOCUMENT_MODELS).filter((m) => m.type === 'pdf' && m.id !== 'local-pdf' && m.available),
  },
  {
    type: 'pptx',
    icon: '📊',
    labelAr: 'عروض تقديمية (PPTX)',
    models: Object.values(DOCUMENT_MODELS).filter((m) => m.type === 'pptx' && m.available),
  },
];

/** Default model — local PDF engine (most reliable) */
const DEFAULT_MODEL = 'local-pdf';

/** Single document generation progress stages */
const SINGLE_STAGES = [
  { id: 'thinking', label: 'جاري توليد المحتوى بالذكاء الاصطناعي...', icon: Brain, color: 'text-blue-500', barColor: 'bg-blue-500' },
  { id: 'generating', label: 'جاري صياغة المحتوى الأكاديمي...', icon: PenTool, color: 'text-blue-500', barColor: 'bg-blue-500' },
  { id: 'designing', label: 'جاري تحليل التصميم واختيار الألوان...', icon: Palette, color: 'text-blue-500', barColor: 'bg-blue-500' },
  { id: 'images', label: 'جاري توليد الصور بالذكاء الاصطناعي...', icon: ImageIcon, color: 'text-blue-500', barColor: 'bg-blue-500' },
  { id: 'rendering', label: 'جاري رندرة المستند بصيغة PDF...', icon: BookOpen, color: 'text-blue-500', barColor: 'bg-blue-500' },
  { id: 'finalizing', label: 'جاري إصدار الملف النهائي...', icon: FileDown, color: 'text-blue-500', barColor: 'bg-blue-500' },
] as const;

/** Batch progress stages */
const BATCH_STAGES = [
  {
    id: 'reading',
    label: 'جاري قراءة وتحليل المحاضرات واستخراج البنية الأساسية...',
    min: 10,
    max: 30,
    icon: FileSearch,
    color: 'text-blue-500',
    barColor: 'bg-blue-500',
  },
  {
    id: 'diagrams',
    label: 'جاري استخراج وتجميع الرسومات والمخططات البيانية من الملفات...',
    min: 30,
    max: 50,
    icon: BarChart3,
    color: 'text-blue-500',
    barColor: 'bg-blue-500',
  },
  {
    id: 'writing',
    label: 'جاري صياغة التلخيص الشامل والربط الأكاديمي بين المحاضرات...',
    min: 50,
    max: 80,
    icon: PenTool,
    color: 'text-blue-500',
    barColor: 'bg-blue-500',
  },
  {
    id: 'rendering',
    label: 'جاري رندرة وتجهيز المستند الأكاديمي النهائي بدعم RTL كامل...',
    min: 80,
    max: 95,
    icon: BookOpen,
    color: 'text-blue-500',
    barColor: 'bg-blue-500',
  },
  {
    id: 'done',
    label: 'تم! جاري فتح الملف وحفظه في ملفاتي...',
    min: 95,
    max: 100,
    icon: Check,
    color: 'text-blue-500',
    barColor: 'bg-blue-500',
  },
] as const;

/** Style suggestion chips — natural language descriptions (NOT fixed template IDs) */
const STYLE_SUGGESTION_CHIPS = [
  { label: 'تلقائي', value: '', icon: '✨', description: 'الذكاء الاصطناعي يختار التصميم الأنسب' },
  { label: 'أكاديمي رسمي', value: 'ديزاين أكاديمي رسمي بحدود كلاسيكية وألوان هادئة', icon: '🎓', description: 'تصميم جامعي كلاسيكي' },
  { label: 'داكن تقني', value: 'تصميم داكن تقني بطابع سايبر وألوان نيون', icon: '💻', description: 'داكن مع توهج نيون' },
  { label: 'إسلامي أنيق', value: 'تصميم إسلامي أنيق بزخارف ذهبية وحدود تقليدية', icon: '🕌', description: 'زخارف ذهبية وتصميم تقليدي' },
  { label: 'بسيط ونظيف', value: 'تصميم بسيط نظيف بمساحات واسعة وبدون زخارف', icon: '🤍', description: 'أبيض نظيف ومينيمال' },
  { label: 'إبداعي نابض', value: 'تصميم إبداعي نابض بألوان حيوية وتدرجات جريئة', icon: '🎨', description: 'ملون وجريء وحيوي' },
  { label: 'أنيق فاخر', value: 'تصميم أنيق فاخر بلون واحد مميز وخطوط رفيعة', icon: '💎', description: 'مونوكروم أنيق وفاخر' },
  { label: 'حديث متدرج', value: 'تصميم حديث بتدرجات لونية كاملة وعصري', icon: '🚀', description: 'تدرجات حديثة وعصرية' },
];

/** Max files for batch */
const MAX_BATCH_FILES = 12;

// ─── Batch File Entry ─────────────────────────────────────────────────

interface BatchFileEntry {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
}

// ─── Progress State ───────────────────────────────────────────────────

interface ProgressState {
  stageId: string;
  percent: number;
  isComplete: boolean;
  message?: string;
}

// ─── Main Component ───────────────────────────────────────────────────

export function DocumentGenDialog({
  open,
  onOpenChange,
  initialPrompt,
  initialMode,
  isMyFiles,
}: DocumentGenDialogProps) {
  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState<string>(initialMode === 'batch' ? 'batch' : 'single');

  // ── Single Document State ──
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [language, setLanguage] = useState('ar');
  const [slideCount, setSlideCount] = useState(8);
  const [template, setTemplate] = useState('Basic');
  const [includeImages, setIncludeImages] = useState(true);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [singleChannelName, setSingleChannelName] = useState('بعقل هادي');
  const [singleAiImages, setSingleAiImages] = useState(true); // Default ON: images included
  // designTemplateId is kept as undefined (auto mode) — AI decides the best design
  // When user provides a styleDescription, it becomes the primary design driver
  const [styleDescription, setStyleDescription] = useState('');
  const [selectedChip, setSelectedChip] = useState(''); // tracks which chip is active (empty = auto)
  const [isGenerating, setIsGenerating] = useState(false);
  const [singleProgress, setSingleProgress] = useState<ProgressState | null>(null);
  const [backendTrace, setBackendTrace] = useState<Array<{time: number; stage: string; message: string}>>([]);
  const traceEndRef = useRef<HTMLDivElement>(null);
  const generationStartTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Single Result State ──
  const [result, setResult] = useState<{
    fileUrl: string;
    fileName: string;
    docType: DocumentType;
    model: string;
    durationMs: number;
  } | null>(null);

  // ── Batch State ──
  const [batchFiles, setBatchFiles] = useState<BatchFileEntry[]>([]);
  const [batchInstructions, setBatchInstructions] = useState('');
  const [extractDiagrams, setExtractDiagrams] = useState(false);
  const [batchAiImages, setBatchAiImages] = useState(false);
  // batch designTemplateId removed — AI-driven design only
  const [batchStyleDescription, setBatchStyleDescription] = useState('');
  const [batchSelectedChip, setBatchSelectedChip] = useState('');
  const [batchChannelName, setBatchChannelName] = useState('بعقل هادي');
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<ProgressState | null>(null);
  const [batchResult, setBatchResult] = useState<{
    fileUrl: string;
    fileName: string;
    durationMs: number;
  } | null>(null);
  const [batchTaskId, setBatchTaskId] = useState<string | null>(null);

  // ── Refs ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Stores ──
  const { token } = useAuthStore();
  const { addGeneratedFile, setDocumentGenProgress, setDocumentGenResult, clearDocumentGenState } = useChatStore();

  // ── Apply initialPrompt ──
  useEffect(() => {
    if (open && initialPrompt) {
      if (initialMode === 'batch') {
        setBatchInstructions(initialPrompt);
        setActiveTab('batch');
      } else {
        setTopic(initialPrompt);
        setActiveTab('single');
      }
    }
  }, [open, initialPrompt, initialMode]);

  // ── Cleanup batch progress polling ──
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // ── Auto-scroll trace log to bottom ──
  useEffect(() => {
    if (backendTrace.length > 0 && traceEndRef.current) {
      traceEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [backendTrace.length]);

  // ── Selected model config ──
  const selectedModelConfig = useMemo(
    () => getDocumentModelById(selectedModel),
    [selectedModel],
  );
  const isPPTX = selectedModelConfig?.type === 'pptx';
  const supportsImages = selectedModelConfig?.supportsImages === true;
  const needsTemplate = selectedModel === 'slide-deck-ai';

  // ── File type helpers ──
  const docTypeLabel: Record<string, string> = {
    pdf: 'PDF',
    pptx: 'PowerPoint (PPTX)',
    xlsx: 'Excel (XLSX)',
    docx: 'Word (DOCX)',
  };
  const docTypeIcon: Record<string, string> = {
    pdf: '📄',
    pptx: '📊',
    xlsx: '📈',
    docx: '📝',
  };

  // ── Format duration ──
  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} ثانية`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} دقيقة ${remainingSeconds > 0 ? `و ${remainingSeconds} ثانية` : ''}`;
  };

  // ─────────────────────────────────────────────────────────────────────
  // File Upload Handling
  // ─────────────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const remaining = MAX_BATCH_FILES - batchFiles.length;
      if (remaining <= 0) {
        toast.error(`الحد الأقصى ${MAX_BATCH_FILES} ملفات`);
        return;
      }

      const filesToProcess = Array.from(files).slice(0, remaining);

      for (const file of filesToProcess) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'txt', 'docx'].includes(ext || '')) {
          toast.error(`نوع الملف غير مدعوم: ${file.name}`);
          continue;
        }

        try {
          let content = '';
          if (ext === 'txt') {
            content = await file.text();
          } else {
            // For PDF and DOCX, read as base64 data URI
            content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }

          const entry: BatchFileEntry = {
            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            name: file.name,
            size: file.size,
            type: ext || 'unknown',
            content,
          };
          setBatchFiles((prev) => [...prev, entry]);
        } catch {
          toast.error(`فشل في قراءة الملف: ${file.name}`);
        }
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [batchFiles.length],
  );

  const removeBatchFile = (fileId: string) => {
    setBatchFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // ─────────────────────────────────────────────────────────────────────
  // Single Document Generation
  // ─────────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error('يرجى إدخال عنوان المستند');
      return;
    }

    setIsGenerating(true);
    setResult(null);
    setBackendTrace([]);
    setSingleProgress({ stageId: 'thinking', percent: 5, isComplete: false });
    generationStartTimeRef.current = Date.now();

    // Also update chat store for inline progress display
    clearDocumentGenState();
    setDocumentGenProgress({ stage: 'analyzing', progress: 5, detail: 'تحليل الطلب...' });

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const isLocalPdf = selectedModel === 'local-pdf';
    const shouldIncludeImages = singleAiImages === true;
    // No designTemplateId — AI decides the best design based on content + styleDescription
    // When styleDescription is empty, the LLM design reasoning analyzes content automatically

    try {
      const response = await fetch('/api/ai/hf/document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isLocalPdf ? { 'Accept': 'text/event-stream' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mode: isLocalPdf ? 'local' : 'single',
          modelId: selectedModel,
          topic: topic.trim(),
          slideCount: isPPTX ? slideCount : undefined,
          language,
          instructions: instructions.trim() || undefined,
          template: needsTemplate ? template : undefined,
          channelName: singleChannelName.trim() || undefined,
          includeAiImages: shouldIncludeImages || undefined,
          // designTemplateId is NOT sent — AI-driven design only
          styleDescription: styleDescription.trim() || undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorMessage = `خطأ في الخادم (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (response.status === 504 || response.status === 502) {
            errorMessage = 'انتهت مهلة الخادم. يرجى المحاولة مرة أخرى.';
          } else if (response.status === 401) {
            errorMessage = 'يرجى تسجيل الدخول أولاً';
          }
        }
        throw new Error(errorMessage);
      }

      // ── SSE for local-pdf mode ──
      if (isLocalPdf && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === 'progress') {
                  setBackendTrace(prev => [...prev, {time: Date.now(), stage: data.stage, message: data.message || ''}]);
                  setSingleProgress({
                    stageId: data.stage,
                    percent: data.progress,
                    isComplete: data.progress >= 100,
                    message: data.message || '',
                  });
                  // Also update chat store for inline progress display
                  setDocumentGenProgress({
                    stage: data.stage,
                    progress: data.progress,
                    detail: data.message || '',
                  });
                } else if (currentEvent === 'completed') {
                  const genResult = {
                    fileUrl: data.fileUrl,
                    fileName: data.fileName,
                    docType: data.docType as DocumentType,
                    model: data.model,
                    durationMs: data.durationMs,
                  };

                  setResult(genResult);
                  setBackendTrace(prev => [...prev, {time: Date.now(), stage: 'completed', message: 'تم إنشاء المستند بنجاح'}]);
                  setSingleProgress({ stageId: 'completed', percent: 100, isComplete: true });

                  // Update chat store with final result for inline display
                  setDocumentGenProgress({
                    stage: 'completed',
                    progress: 100,
                    detail: 'تم إنشاء المستند بنجاح!',
                  });
                  setDocumentGenResult({
                    fileUrl: data.fileUrl,
                    fileName: data.fileName,
                    docType: data.docType || 'pdf',
                    durationMs: data.durationMs,
                  });

                  addGeneratedFile({
                    id: `doc-${Date.now()}`,
                    name: genResult.fileName,
                    url: genResult.fileUrl,
                    type: 'document',
                    createdAt: new Date().toISOString(),
                    size: 0,
                  });

                  const serveUrl = genResult.fileUrl.includes('/api/pdf/serve/')
                    ? genResult.fileUrl
                    : `/api/pdf/serve/${genResult.fileUrl.split('/').pop()}`;
                  window.open(serveUrl, '_blank', 'noopener,noreferrer');

                  toast.success('تم إنشاء المستند بنجاح!', {
                    action: {
                      label: 'تحميل',
                      onClick: () => handleDownload(serveUrl, genResult.fileName),
                    },
                  });
                } else if (currentEvent === 'error') {
                  throw new Error(data.error || 'فشل في إنشاء المستند');
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && parseErr.message !== 'فشل في إنشاء المستند' && !parseErr.message.includes('فشل')) {
                  // Ignore JSON parse errors for incomplete data
                  console.warn('[SSE] Parse error:', parseErr);
                } else {
                  throw parseErr;
                }
              }
            }
          }
        }
      } else {
        // ── Non-SSE fallback (external models) ──
        const data = await response.json();

        if (!data.success || !data.fileUrl) {
          throw new Error(data.error || 'فشل في إنشاء المستند');
        }

        const genResult = {
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          docType: data.docType as DocumentType,
          model: data.model,
          durationMs: data.durationMs,
        };

        setResult(genResult);

        // Update chat store for inline result display
        setDocumentGenProgress({
          stage: 'completed',
          progress: 100,
          detail: 'تم إنشاء المستند بنجاح!',
        });
        setDocumentGenResult({
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          docType: data.docType || 'pdf',
          durationMs: data.durationMs,
        });

        addGeneratedFile({
          id: `doc-${Date.now()}`,
          name: genResult.fileName,
          url: genResult.fileUrl,
          type: 'document',
          createdAt: new Date().toISOString(),
          size: 0,
        });

        const serveUrl = genResult.fileUrl.includes('/api/pdf/serve/')
          ? genResult.fileUrl
          : `/api/pdf/serve/${genResult.fileUrl.split('/').pop()}`;
        window.open(serveUrl, '_blank', 'noopener,noreferrer');

        toast.success('تم إنشاء المستند بنجاح!', {
          action: {
            label: 'تحميل',
            onClick: () => handleDownload(serveUrl, genResult.fileName),
          },
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('تم إلغاء إنشاء المستند');
      } else if (error instanceof Error && error.message.includes('timeout')) {
        toast.error('انتهت مهلة إنشاء المستند. قد يستغرق الأمر بضع دقائق، يرجى المحاولة مرة أخرى.');
      } else {
        toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء المستند');
      }
    } finally {
      setIsGenerating(false);
      setSingleProgress(null);
      abortControllerRef.current = null;
      // Don't clear document gen state here — let the MessageBubble show the result card
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Batch Document Generation
  // ─────────────────────────────────────────────────────────────────────

  const handleBatchGenerate = async () => {
    if (batchFiles.length === 0) {
      toast.error('يرجى إضافة ملف واحد على الأقل');
      return;
    }

    setIsBatchGenerating(true);
    setBatchResult(null);
    setBatchProgress({ stageId: 'reading', percent: 5, isComplete: false });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300_000); // 5 min timeout

      // Start batch generation via the unified document endpoint
      const response = await fetch('/api/ai/hf/document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mode: 'batch',
          // FIX: Backend expects "lectures" with {title, content}, NOT "files" with {name, content, type}
          topic: batchFiles.map(f => f.name.replace(/\.[^.]+$/, '')).join(' + ') || 'ملخص محاضرات',
          lectures: batchFiles.map((f) => ({
            title: f.name.replace(/\.[^.]+$/, ''),
            content: f.content,
          })),
          instructions: batchInstructions.trim() || undefined,
          extractDiagrams,
          includeAiImages: batchAiImages,
          // designTemplateId removed — AI-driven design only
          styleDescription: batchStyleDescription.trim() || undefined,
          channelName: batchChannelName.trim() || 'بعقل هادي',
          language: 'ar',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-JSON responses
      if (!response.ok) {
        let errorMessage = `خطأ في الخادم (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (response.status === 504 || response.status === 502) {
            errorMessage = 'انتهت مهلة الخادم. يرجى المحاولة مرة أخرى.';
          } else if (response.status === 401) {
            errorMessage = 'يرجى تسجيل الدخول أولاً';
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.taskId) {
        // Server supports progress polling
        setBatchTaskId(data.taskId);
        startProgressPolling(data.taskId);
      } else if (data.success && data.fileUrl) {
        // Immediate result (no polling needed)
        completeBatchGeneration(data);
      } else {
        throw new Error(data.error || 'فشل في إنشاء المستند');
      }
    } catch (error) {
      setIsBatchGenerating(false);
      setBatchProgress(null);
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('انتهت مهلة إنشاء المستند. يرجى المحاولة مرة أخرى.');
      } else {
        toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء المستند');
      }
    }
  };

  // ── Progress Polling ──
  const startProgressPolling = (taskId: string) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai/hf/document?taskId=${taskId}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) return;

        const data = await response.json();

        if (data.stage) {
          // Map stage name to our stage IDs
          const stageMap: Record<string, string> = {
            reading: 'reading',
            analyzing: 'reading',
            extracting: 'diagrams',
            diagrams: 'diagrams',
            writing: 'writing',
            summarizing: 'writing',
            rendering: 'rendering',
            formatting: 'rendering',
            done: 'done',
            complete: 'done',
          };
          const stageId = stageMap[data.stage] || 'reading';
          setBatchProgress({
            stageId,
            percent: data.percent ?? data.progress ?? 0,
            isComplete: data.stage === 'done' || data.stage === 'complete',
          });
          // Also update chat store for inline progress display
          setDocumentGenProgress({
            stage: data.stage,
            progress: data.percent ?? data.progress ?? 0,
            detail: data.detail || data.message || '',
          });
        }

        if (data.percent >= 100 || data.status === 'complete') {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          // Fetch the final result
          if (data.fileUrl) {
            completeBatchGeneration(data);
          }
        }
      } catch {
        // Silently continue polling
      }
    }, 2000);
  };

  // ── Simulated Progress (fallback when no polling available) ──
  useEffect(() => {
    if (!isBatchGenerating || batchTaskId) return; // Only use simulation if no taskId polling

    const applicableStages = extractDiagrams
      ? BATCH_STAGES
      : BATCH_STAGES.filter((s) => s.id !== 'diagrams');

    let currentStageIdx = 0;
    let currentPercent: number = applicableStages[0]?.min ?? 10;

    const interval = setInterval(() => {
      const stage = applicableStages[currentStageIdx];
      if (!stage) {
        clearInterval(interval);
        return;
      }

      currentPercent += Math.random() * 2 + 0.5;

      if (currentPercent >= stage.max) {
        currentPercent = stage.max;
        if (currentStageIdx < applicableStages.length - 1) {
          currentStageIdx++;
          currentPercent = applicableStages[currentStageIdx].min;
        }
      }

      const isComplete = currentPercent >= 95;
      setBatchProgress({
        stageId: stage.id,
        percent: Math.min(currentPercent, isComplete ? 100 : currentPercent),
        isComplete,
      });

      if (currentPercent >= 100) {
        clearInterval(interval);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [isBatchGenerating, batchTaskId, extractDiagrams]);

  const completeBatchGeneration = (data: {
    fileUrl: string;
    fileName?: string;
    durationMs?: number;
  }) => {
    const genResult = {
      fileUrl: data.fileUrl,
      fileName: data.fileName || `ملخص_محاضرات_${new Date().toLocaleDateString('ar')}.pdf`,
      durationMs: data.durationMs ?? 0,
    };

    setBatchResult(genResult);
    setBatchProgress({ stageId: 'done', percent: 100, isComplete: true });
    setIsBatchGenerating(false);

    // Also update chat store for inline progress display
    setDocumentGenProgress({
      stage: 'completed',
      progress: 100,
      detail: 'تم إنشاء المستند بنجاح!',
    });
    setDocumentGenResult({
      fileUrl: data.fileUrl,
      fileName: data.fileName || `ملخص_محاضرات_${new Date().toLocaleDateString('ar')}.pdf`,
      docType: 'pdf',
      durationMs: data.durationMs,
    });

    // Add to generated files store
    addGeneratedFile({
      id: `batch-${Date.now()}`,
      name: genResult.fileName,
      url: genResult.fileUrl,
      type: 'document',
      createdAt: new Date().toISOString(),
      size: 0,
    });

    // Auto-open PDF in new tab
    window.open(genResult.fileUrl, '_blank', 'noopener,noreferrer');

    toast.success('تم إنشاء المستند بنجاح!', {
      action: {
        label: 'تحميل',
        onClick: () => {
          const a = document.createElement('a');
          a.href = genResult.fileUrl;
          a.download = genResult.fileName;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        },
      },
    });

    // Cleanup polling
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Common Handlers
  // ─────────────────────────────────────────────────────────────────────

  const handleDownload = (fileUrl: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Cleanup polling
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    // Clear document gen state when dialog closes
    clearDocumentGenState();
    // Reset after animation
    setTimeout(() => {
      setTopic('');
      setInstructions('');
      setLanguage('ar');
      setSlideCount(8);
      setTemplate('Basic');
      setIncludeImages(true);
      setSelectedModel(DEFAULT_MODEL);
      setSingleChannelName('بعقل هادي');
      setSingleAiImages(true);
      setStyleDescription('');
      setSelectedChip('');
      setResult(null);
      setSingleProgress(null);
      setIsGenerating(false);
      setBackendTrace([]);
      // Batch reset
      setBatchFiles([]);
      setBatchInstructions('');
      setExtractDiagrams(false);
      setBatchAiImages(false);
      setBatchStyleDescription('');
      setBatchSelectedChip('');
      setBatchChannelName('بعقل هادي');
      setIsBatchGenerating(false);
      setBatchProgress(null);
      setBatchResult(null);
      setBatchTaskId(null);
      setActiveTab('single');
    }, 300);
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    if (value !== 'slide-deck-ai') {
      setTemplate('Basic');
    }
  };

  // ── Compute which stages are applicable for progress ──
  const applicableStages = extractDiagrams
    ? BATCH_STAGES
    : BATCH_STAGES.filter((s) => s.id !== 'diagrams');

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-blue-500" />
            {isMyFiles ? 'ملفاتي — نظام توليد الملفات الموحد' : 'إنشاء مستند بالذكاء الاصطناعي'}
          </DialogTitle>
          <DialogDescription>
            {isMyFiles ? 'أنشئ ملفات PDF و PowerPoint باستخدام النظام الموحد — مدعوم بالذكاء الاصطناعي' : 'أنشئ مستندات أكاديمية وعروض تقديمية باستخدام نماذج الذكاء الاصطناعي'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="single" className="gap-1.5">
              <FileText className="size-3.5 text-blue-500" />
              مستند واحد
            </TabsTrigger>
            <TabsTrigger value="batch" className="gap-1.5">
              <BookOpen className="size-3.5 text-blue-500" />
              معالجة دفعة محاضرات
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════
              SINGLE DOCUMENT TAB
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="single" className="space-y-4 mt-4">
            {/* Document Model Selector */}
            <div className="space-y-2">
              <Label>نوع المستند والنموذج</Label>
              <Select value={selectedModel} onValueChange={handleModelChange} disabled={isGenerating}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_GROUPS.map((group) =>
                    group.models.length > 0 ? (
                      <SelectGroup key={group.type}>
                        <SelectLabel className="flex items-center gap-1.5 font-semibold text-xs">
                          <span>{group.icon}</span>
                          <span>{group.labelAr}</span>
                        </SelectLabel>
                        {group.models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <span className="flex items-center gap-1.5">
                              <span>{m.icon}</span>
                              <span>{m.nameAr}</span>
                              {m.supportsImages && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 mr-1">
                                  <ImageIcon className="size-2.5 ml-0.5" />
                                  صور AI
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null
                  )}
                </SelectContent>
              </Select>
              {selectedModelConfig && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {docTypeIcon[selectedModelConfig.type]} {selectedModelConfig.nameAr} — {selectedModelConfig.descriptionAr}
                </p>
              )}
            </div>

            {/* Topic/Title Input */}
            <div className="space-y-2">
              <Label htmlFor="doc-topic">
                عنوان المستند <span className="text-destructive">*</span>
              </Label>
              <Input
                id="doc-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="مثال: الذكاء الاصطناعي في التعليم..."
                dir="auto"
                disabled={isGenerating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating && topic.trim()) {
                    handleGenerate();
                  }
                }}
              />
            </div>

            {/* Instructions Textarea */}
            <div className="space-y-2">
              <Label htmlFor="doc-instructions">تعليمات إضافية (اختياري)</Label>
              <Textarea
                id="doc-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="مثال: ركز على التطبيقات العملية، أضف إحصائيات حديثة..."
                dir="auto"
                disabled={isGenerating}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Language & Slide Count Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>اللغة</Label>
                <Select value={language} onValueChange={setLanguage} disabled={isGenerating}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isPPTX && (
                <div className="space-y-2">
                  <Label>عدد الشرائح: {slideCount}</Label>
                  <Slider
                    value={[slideCount]}
                    onValueChange={(v) => setSlideCount(v[0])}
                    min={5}
                    max={20}
                    step={1}
                    disabled={isGenerating}
                    className="mt-3"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>5</span>
                    <span>20</span>
                  </div>
                </div>
              )}
            </div>

            {/* Template Selector */}
            {needsTemplate && (
              <div className="space-y-2">
                <Label>قالب العرض</Label>
                <Select value={template} onValueChange={setTemplate} disabled={isGenerating}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SLIDE_DECK_TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label} ({t.value})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Channel Name Input */}
            <div className="space-y-2">
              <Label htmlFor="single-channel">اسم القناة</Label>
              <Input
                id="single-channel"
                value={singleChannelName}
                onChange={(e) => setSingleChannelName(e.target.value)}
                placeholder="بعقل هادي"
                dir="auto"
                disabled={isGenerating}
              />
            </div>

            {/* AI Image Toggle & Design Style */}
            <div className="space-y-3">
              {/* تضمين الصور toggle — enhanced with visual preview */}
              <div className={cn(
                'rounded-lg border p-3 transition-all',
                singleAiImages
                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950'
                  : 'border-border bg-transparent'
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      'flex items-center justify-center size-8 rounded-lg transition-colors',
                      singleAiImages
                        ? 'bg-blue-100 dark:bg-blue-900'
                        : 'muted'
                    )}>
                      <ImageIcon className={cn(
                        'size-4 transition-colors',
                        singleAiImages ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                      )} />
                    </div>
                    <div>
                      <Label className="cursor-pointer text-sm font-medium">تضمين الصور بالذكاء الاصطناعي</Label>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {singleAiImages
                          ? '✨ سيتم توليد صور توضيحية ملائمة للمحتوى وإضافتها في المستند'
                          : 'المستند هيكون نص فقط بدون صور — أسرع في الإنشاء'
                        }
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={singleAiImages}
                    onCheckedChange={setSingleAiImages}
                    disabled={isGenerating}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>
              </div>

              {/* Design Style — AI-powered dynamic design with suggestion chips */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-blue-500" />
                  <Label className="text-sm font-medium">نمط التصميم</Label>
                </div>

                {/* Suggestion Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_SUGGESTION_CHIPS.map((chip) => {
                    const isActive = selectedChip === chip.value && (!chip.value ? !styleDescription.trim() : styleDescription.trim() === chip.value);
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          if (chip.value === '') {
                            // Auto mode — clear style description
                            setStyleDescription('');
                            setSelectedChip('');
                          } else {
                            setStyleDescription(chip.value);
                            setSelectedChip(chip.value);
                          }
                        }}
                        disabled={isGenerating}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border',
                          isActive
                            ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 shadow-sm'
                            : 'muted border-border text-muted-foreground hover:bg-muted hover:border-border hover:text-foreground',
                          isGenerating && 'opacity-50 cursor-not-allowed',
                        )}
                        title={chip.description}
                      >
                        <span className="text-xs">{chip.icon}</span>
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Textarea for custom style description */}
                <Textarea
                  id="style-description"
                  value={styleDescription}
                  onChange={(e) => {
                    setStyleDescription(e.target.value);
                    // Deselect chip if user types something different
                    if (e.target.value !== selectedChip) {
                      setSelectedChip('');
                    }
                  }}
                  placeholder="صفي التصميم اللي عايزاه... مثال: ديزاين داكن أنيق، أو تصميم أبيض بسيط مع لمسات ذهبية، أو dark neon cyber style..."
                  dir="auto"
                  disabled={isGenerating}
                  rows={2}
                  className="resize-none text-sm"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {styleDescription.trim()
                    ? '✨ الذكاء الاصطناعي هيصمم مستند فريد خصيصاً بناءً على وصفك'
                    : '✨ افتراضي: الذكاء الاصطناعي يختار التصميم الأنسب تلقائياً بناءً على المحتوى'
                  }
                </p>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !topic.trim()}
              className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 ml-2 animate-spin" />
                  جاري إنشاء المستند...
                </>
              ) : (
                <>
                  <FileDown className="size-4 ml-2" />
                  إنشاء المستند
                </>
              )}
            </Button>

            {/* ── Single Doc Progress Pipeline ── */}
            {isGenerating && singleProgress && (() => {
              const isLocalPdf = selectedModel === 'local-pdf';
              const applicableSingleStages = (isLocalPdf && singleAiImages)
                ? SINGLE_STAGES
                : SINGLE_STAGES.filter((s) => s.id !== 'images');
              const currentStageIdx = applicableSingleStages.findIndex(
                (s) => s.id === singleProgress.stageId || (singleProgress.stageId === 'images_progress' && s.id === 'images')
              );

              return (
                <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-bl from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950">
                  <CardContent className="p-4 space-y-3">
                    {/* Circular progress + stage label */}
                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center shrink-0">
                        <svg className="size-16 -rotate-90" viewBox="0 0 36 36">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            className="text-muted"
                            strokeWidth="2.5"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            className={applicableSingleStages[Math.max(0, currentStageIdx)]?.color || 'text-blue-500'}
                            strokeWidth="2.5"
                            strokeDasharray={`${singleProgress.percent}, 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute text-xs font-bold">{Math.round(singleProgress.percent)}%</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {singleProgress.message || applicableSingleStages[Math.max(0, currentStageIdx)]?.label || 'جاري الإنشاء...'}
                        </p>
                        <Progress value={singleProgress.percent} className="mt-2 h-1.5" />
                      </div>
                    </div>

                    {/* Vertical Pipeline */}
                    <div className="space-y-1 mt-2">
                      {applicableSingleStages.map((stage, idx) => {
                        const isComplete = idx < currentStageIdx;
                        const isCurrent = idx === currentStageIdx;
                        const Icon = stage.icon;

                        return (
                          <div
                            key={stage.id}
                            className={cn(
                              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-all',
                              isCurrent && 'background shadow-sm font-medium',
                              isComplete && 'text-muted-foreground',
                              !isComplete && !isCurrent && 'text-muted-foreground',
                            )}
                          >
                            <div className={cn(
                              'flex items-center justify-center size-5 rounded-full shrink-0',
                              isComplete && 'bg-blue-100 dark:bg-blue-900',
                              isCurrent && 'bg-blue-100 dark:bg-blue-900',
                              !isComplete && !isCurrent && 'bg-muted',
                            )}>
                              {isComplete ? (
                                <Check className="size-3 text-blue-600 dark:text-blue-400" />
                              ) : isCurrent ? (
                                <Loader2 className="size-3 animate-spin text-blue-600 dark:text-blue-400" />
                              ) : (
                                <Icon className="size-2.5" />
                              )}
                            </div>
                            <span className={cn(
                              isComplete && 'line-through',
                              isCurrent && stage.color,
                            )}>
                              {stage.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Backend Operations Trace */}
                    {backendTrace.length > 0 && (
                      <div className="mt-3 rounded-md bg-blue-50 dark:bg-blue-950 dark:bg-blue-50 dark:bg-blue-950 border border-border p-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Terminal className="size-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground font-medium">عمليات الباك إند</span>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5 custom-scrollbar">
                          {backendTrace.map((entry, idx) => {
                            const stageConfig = applicableSingleStages.find(s => s.id === entry.stage);
                            const isLatest = idx === backendTrace.length - 1;
                            return (
                              <div key={idx} className={cn(
                                'flex items-start gap-1.5 text-[10px] font-mono dir-ltr',
                                isLatest ? 'text-foreground' : 'text-muted-foreground'
                              )}>
                                <span className="text-muted-foreground shrink-0">
                                  {new Date(entry.time).toLocaleTimeString('en', {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                                </span>
                                <span className={cn('shrink-0', stageConfig?.color)}>{stageConfig?.icon && <stageConfig.icon className="size-2.5 inline" />}</span>
                                <span className="break-all">{entry.message || entry.stage}</span>
                              </div>
                            );
                          })}
                          <div ref={traceEndRef} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Loading note (non-local-pdf models) */}
            {isGenerating && selectedModel !== 'local-pdf' && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-700 dark:text-blue-300">
                <Clock className="size-4 shrink-0 mt-0.5" />
                <span>
                  قد تستغرق عملية إنشاء المستند من دقيقة إلى 3 دقائق حسب النموذج المستخدم.
                  يرجى الانتظار وعدم إغلاق النافذة.
                </span>
              </div>
            )}

            {/* Result Display */}
            {result && !isGenerating && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border muted p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-12 rounded-lg bg-blue-100 dark:bg-blue-900">
                      <span className="text-2xl">{docTypeIcon[result.docType]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{result.fileName}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          {docTypeLabel[result.docType] || result.docType}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {result.model}
                        </Badge>
                        {result.durationMs > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {formatDuration(result.durationMs)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => setResult(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownload(result.fileUrl, result.fileName)}
                    className="flex-1"
                  >
                    <Download className="size-4 ml-2" />
                    تحميل المستند
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex-1"
                  >
                    <RefreshCw className="size-4 ml-2" />
                    إنشاء مرة أخرى
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              BATCH LECTURE PROCESSING TAB
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="batch" className="space-y-4 mt-4">
            {/* ── Progress Indicator ── */}
            {isBatchGenerating && batchProgress && (() => {
              const currentStage = BATCH_STAGES.find((s) => s.id === batchProgress.stageId);
              const currentStageIdx = applicableStages.findIndex((s) => s.id === batchProgress.stageId);
              const processingFileIdx = Math.floor((batchProgress.percent / 100) * batchFiles.length);

              return (
                <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-bl from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950">
                  <CardContent className="p-4 space-y-3">
                    {/* Circular progress + stage label */}
                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center shrink-0">
                        <svg className="size-16 -rotate-90" viewBox="0 0 36 36">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="#e2e8f0"
                            strokeWidth="3"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="#0d9488"
                            strokeWidth="3"
                            strokeDasharray={`${batchProgress.percent}, 100`}
                            strokeLinecap="round"
                            className="transition-all duration-500"
                          />
                        </svg>
                        <span className="absolute text-sm font-bold text-blue-600 dark:text-blue-400">
                          {Math.round(batchProgress.percent)}%
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {currentStage?.label || 'جاري المعالجة...'}
                        </p>
                        {batchFiles.length > 1 && !batchProgress.isComplete && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            جاري معالجة المحاضرة {Math.min(processingFileIdx + 1, batchFiles.length)} من {batchFiles.length}...
                          </p>
                        )}
                        <Progress
                          value={batchProgress.percent}
                          className="h-2 mt-2"
                        />
                      </div>
                    </div>

                    {/* Stage timeline */}
                    <div className="flex items-center justify-between gap-1 mt-2">
                      {applicableStages.map((stage, idx) => {
                        const StageIcon = stage.icon;
                        const isPast = currentStageIdx > idx;
                        const isCurrent = stage.id === batchProgress.stageId;
                        const isFuture = !isPast && !isCurrent;

                        return (
                          <div key={stage.id} className="flex flex-col items-center gap-1 flex-1">
                            <div className={cn(
                              'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300',
                              isPast && 'bg-blue-500 border-blue-500 text-white',
                              isCurrent && 'bg-white dark:bg-gray-900 border-blue-500 text-blue-500 animate-pulse shadow-md shadow-blue-200 dark:shadow-blue-900',
                              isFuture && 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                            )}>
                              {isPast ? <Check className="size-4" /> : <StageIcon className="size-3.5" />}
                            </div>
                            <span className={cn(
                              'text-[9px] text-center leading-tight',
                              isCurrent && 'text-blue-600 dark:text-blue-400 font-bold',
                              isPast && 'text-blue-600 dark:text-blue-400',
                              isFuture && 'text-gray-400'
                            )}>
                              {stage.id === 'reading' ? 'تحليل' :
                               stage.id === 'diagrams' ? 'رسومات' :
                               stage.id === 'writing' ? 'تلخيص' :
                               stage.id === 'rendering' ? 'رندرة' : 'تم'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* File list during processing */}
                    {batchFiles.length > 0 && (
                      <div className="mt-3 max-h-32 overflow-y-auto scrollbar-thin">
                        <div className="space-y-1">
                          {batchFiles.map((file, idx) => {
                            const isProcessing = idx === processingFileIdx && !batchProgress.isComplete;
                            const isDone = idx < processingFileIdx || batchProgress.isComplete;
                            return (
                              <div key={file.id} className={cn(
                                'flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors',
                                isProcessing && 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
                                isDone && 'text-blue-600 dark:text-blue-400',
                                !isProcessing && !isDone && 'text-gray-400 dark:text-gray-500'
                              )}>
                                {isProcessing && <Loader2 className="size-3 animate-spin" />}
                                {isDone && <Check className="size-3" />}
                                {!isProcessing && !isDone && <FileText className="size-3" />}
                                <span className="truncate">{file.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* ── File Upload Area ── */}
            <div className="space-y-2">
              <Label>ملفات المحاضرات (حتى {MAX_BATCH_FILES} ملف)</Label>
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  isBatchGenerating
                    ? 'border-muted-foreground bg-muted cursor-not-allowed'
                    : 'border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950'
                }`}
                onClick={() => {
                  if (!isBatchGenerating && fileInputRef.current) {
                    fileInputRef.current.click();
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.docx"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isBatchGenerating}
                />
                <Upload className="size-8 mx-auto text-blue-500 mb-2" />
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  اسحب الملفات هنا أو اضغط للاختيار
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, TXT, DOCX — حتى {MAX_BATCH_FILES} ملف
                </p>
                {batchFiles.length > 0 && (
                  <Badge variant="secondary" className="mt-2">
                    {batchFiles.length} / {MAX_BATCH_FILES}
                  </Badge>
                )}
              </div>
            </div>

            {/* ── Uploaded Files Grid ── */}
            {batchFiles.length > 0 && (
              <div className="space-y-2">
                <Label>الملفات المرفوعة</Label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                  {batchFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 group"
                    >
                      <FileText className="size-4 shrink-0 text-blue-500" />
                      <span className="flex-1 text-sm truncate" dir="auto">
                        {file.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {file.type.toUpperCase()}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBatchFile(file.id);
                        }}
                        disabled={isBatchGenerating}
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Batch Instructions ── */}
            <div className="space-y-2">
              <Label htmlFor="batch-instructions">تعليمات المعالجة</Label>
              <Textarea
                id="batch-instructions"
                value={batchInstructions}
                onChange={(e) => setBatchInstructions(e.target.value)}
                placeholder="مثال: لخص لي المحاضرات كلها / اعمل لي ملف فيه كل الرسومات..."
                dir="auto"
                disabled={isBatchGenerating}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* ── Channel Name ── */}
            <div className="space-y-2">
              <Label htmlFor="batch-channel">اسم القناة</Label>
              <Input
                id="batch-channel"
                value={batchChannelName}
                onChange={(e) => setBatchChannelName(e.target.value)}
                placeholder="بعقل هادي"
                dir="auto"
                disabled={isBatchGenerating}
              />
            </div>

            {/* ── Toggles ── */}
            <div className="space-y-3">
              {/* Extract Diagrams Toggle */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-blue-500" />
                  <div>
                    <Label className="cursor-pointer text-sm">استخراج الرسومات والمخططات</Label>
                    <p className="text-[11px] text-muted-foreground">استخراج وتجميع المخططات البيانية من المحاضرات</p>
                  </div>
                </div>
                <Switch
                  checked={extractDiagrams}
                  onCheckedChange={setExtractDiagrams}
                  disabled={isBatchGenerating}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* AI Images Toggle */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-500" />
                  <div>
                    <Label className="cursor-pointer text-sm">تضمين صور AI</Label>
                    <p className="text-[11px] text-muted-foreground">إضافة صور مولدة بالذكاء الاصطناعي للمستند</p>
                  </div>
                </div>
                <Switch
                  checked={batchAiImages}
                  onCheckedChange={setBatchAiImages}
                  disabled={isBatchGenerating}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* Design Style for batch — AI-powered dynamic design with suggestion chips */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-blue-500" />
                  <Label className="text-sm font-medium">نمط التصميم</Label>
                </div>

                {/* Suggestion Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_SUGGESTION_CHIPS.map((chip) => {
                    const isActive = batchSelectedChip === chip.value && (!chip.value ? !batchStyleDescription.trim() : batchStyleDescription.trim() === chip.value);
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          if (chip.value === '') {
                            setBatchStyleDescription('');
                            setBatchSelectedChip('');
                          } else {
                            setBatchStyleDescription(chip.value);
                            setBatchSelectedChip(chip.value);
                          }
                        }}
                        disabled={isBatchGenerating}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border',
                          isActive
                            ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 shadow-sm'
                            : 'muted border-border text-muted-foreground hover:bg-muted hover:border-border hover:text-foreground',
                          isBatchGenerating && 'opacity-50 cursor-not-allowed',
                        )}
                        title={chip.description}
                      >
                        <span className="text-xs">{chip.icon}</span>
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Textarea for custom style description */}
                <Textarea
                  id="batch-style-description"
                  value={batchStyleDescription}
                  onChange={(e) => {
                    setBatchStyleDescription(e.target.value);
                    if (e.target.value !== batchSelectedChip) {
                      setBatchSelectedChip('');
                    }
                  }}
                  placeholder="صفي التصميم اللي عايزاه... مثال: ديزاين داكن أنيق، أو تصميم أبيض بسيط مع لمسات ذهبية، أو dark neon cyber style..."
                  dir="auto"
                  disabled={isBatchGenerating}
                  rows={2}
                  className="resize-none text-sm"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {batchStyleDescription.trim()
                    ? '✨ الذكاء الاصطناعي هيصمم مستند فريد خصيصاً بناءً على وصفك'
                    : '✨ افتراضي: الذكاء الاصطناعي يختار التصميم الأنسب تلقائياً بناءً على المحتوى'
                  }
                </p>
              </div>
            </div>

            {/* ── Generate Button ── */}
            <Button
              onClick={handleBatchGenerate}
              disabled={isBatchGenerating || batchFiles.length === 0}
              className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
            >
              {isBatchGenerating ? (
                <>
                  <Loader2 className="size-4 ml-2 animate-spin" />
                  جاري معالجة المحاضرات...
                </>
              ) : (
                <>
                  <BookOpen className="size-4 ml-2" />
                  معالجة المحاضرات
                </>
              )}
            </Button>

            {/* ── Loading note ── */}
            {isBatchGenerating && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-700 dark:text-blue-300">
                <Clock className="size-4 shrink-0 mt-0.5" />
                <span>
                  قد تستغرق عملية معالجة المحاضرات من 2 إلى 5 دقائق حسب عدد الملفات.
                  يرجى الانتظار وعدم إغلاق النافذة.
                </span>
              </div>
            )}

            {/* ── Batch Result Display ── */}
            {batchResult && !isBatchGenerating && (
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-gradient-to-bl from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-12 rounded-lg bg-blue-100 dark:bg-blue-900">
                      <Check className="size-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{batchResult.fileName}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          PDF
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                          معالجة دفعة
                        </Badge>
                        {batchResult.durationMs > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {formatDuration(batchResult.durationMs)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => setBatchResult(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  {/* Detailed result stats */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
                        <FileText className="size-3.5" />
                        <span className="text-base font-bold">{batchFiles.length}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">محاضرة</p>
                    </div>
                    {extractDiagrams && (
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
                          <BarChart3 className="size-3.5" />
                          <span className="text-base font-bold">✓</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">رسومات مستخرجة</p>
                      </div>
                    )}
                    <div className={cn('text-center', extractDiagrams ? '' : 'col-span-2')}>
                      <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
                        <BookOpen className="size-3.5" />
                        <span className="text-base font-bold">✓</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">تم الفتح تلقائياً</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownload(batchResult.fileUrl, batchResult.fileName)}
                    className="flex-1"
                  >
                    <Download className="size-4 ml-2" />
                    تحميل المستند
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleBatchGenerate}
                    disabled={isBatchGenerating || batchFiles.length === 0}
                    className="flex-1"
                  >
                    <RefreshCw className="size-4 ml-2" />
                    معالجة مرة أخرى
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
