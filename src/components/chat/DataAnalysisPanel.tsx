'use client';

import { useState, useCallback, useRef } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Upload,
  FileSpreadsheet,
  X,
  Loader2,
  Sparkles,
  Lightbulb,
  TrendingUp,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Send,
  Download,
  ImageIcon,
  Table2,
  Database,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────
interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'radar' | 'scatter';
  title: string;
  data: { labels: string[]; values: number[] };
  colors: string[];
}

interface DataAnalysisResult {
  summary: string;
  insights: string[];
  charts: { spec: ChartSpec; svg: string }[];
  recommendation: string;
}

interface DataAnalysisPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UploadedFile {
  id: string;
  name: string;
  content: string;
  type: string;
  size: number;
  preview?: string[][]; // First 5 rows for preview
}

type AnalysisStep = 'upload' | 'results';

// ─── Constants ────────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = ['.csv', '.tsv', '.txt', '.xlsx', '.xls'];
const ACCEPTED_MIME_TYPES = [
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 5;

const CHART_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  bar: { label: 'أعمدة', icon: '📊' },
  line: { label: 'خطي', icon: '📈' },
  pie: { label: 'دائري', icon: '🥧' },
  radar: { label: 'رادار', icon: '🕸️' },
  scatter: { label: 'نقاط', icon: '⚬' },
};

// ─── CSV parsing utility ──────────────────────────────────────────────
function parseCSVRows(content: string, maxRows: number = 6): string[][] {
  const lines = content.trim().split('\n').slice(0, maxRows);
  return lines.map((line) => {
    // Simple CSV parser — handle quoted values
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    row.push(current.trim());
    return row;
  });
}

// ─── File reading utility ─────────────────────────────────────────────
function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve(result);
    };
    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    // Read as data URL for binary files (xlsx), as text for CSV
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['xlsx', 'xls'].includes(ext)) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file, 'utf-8');
    }
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return ACCEPTED_EXTENSIONS.includes(`.${ext}`) || ACCEPTED_MIME_TYPES.includes(file.type);
}

// ─── Chart PNG Download ───────────────────────────────────────────────
function downloadChartAsPNG(svgHtml: string, title: string) {
  const container = document.createElement('div');
  container.innerHTML = svgHtml;
  const svgElement = container.querySelector('svg');
  if (!svgElement) {
    toast.error('لم يتم العثور على الرسم البياني');
    return;
  }

  const svgData = new XMLSerializer().serializeToString(svgElement);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  img.onload = () => {
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `chart-${title.slice(0, 20).replace(/\s+/g, '-')}-${Date.now()}.png`;
    a.click();
    toast.success('تم تحميل الرسم البياني');
  };

  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
}

// ─── Main Component ───────────────────────────────────────────────────
export function DataAnalysisPanel({ open, onOpenChange }: DataAnalysisPanelProps) {
  // State
  const [step, setStep] = useState<AnalysisStep>('upload');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DataAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [expandedChart, setExpandedChart] = useState<number | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── File handling ────────────────────────────────────────────────
  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);

    for (const file of fileArray) {
      setFiles((prev) => {
        if (prev.length >= MAX_FILES) {
          toast.error(`الحد الأقصى ${MAX_FILES} ملفات`);
          return prev;
        }

        if (!isAcceptedFile(file)) {
          toast.error(`نوع الملف "${file.name}" غير مدعوم. المسموح: CSV, TSV, TXT, XLSX, XLS`);
          return prev;
        }

        if (file.size > MAX_FILE_SIZE) {
          toast.error(`الملف "${file.name}" كبير جداً. الحد الأقصى 5 ميجابايت`);
          return prev;
        }

        // Read file asynchronously - but we need to handle this differently
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const fileType = ['xlsx', 'xls'].includes(ext) ? 'excel' : 'csv';

        const uploadedFile: UploadedFile = {
          id,
          name: file.name,
          content: '', // Will be filled asynchronously
          type: fileType,
          size: file.size,
        };

        // Read the file content asynchronously
        readFileContent(file).then((content) => {
          const preview = fileType === 'csv' ? parseCSVRows(content) : undefined;
          setFiles((prevFiles) =>
            prevFiles.map((f) =>
              f.id === id ? { ...f, content, preview } : f
            )
          );
        }).catch(() => {
          toast.error(`فشل في قراءة الملف "${file.name}"`);
          setFiles((prevFiles) => prevFiles.filter((f) => f.id !== id));
        });

        return [...prev, uploadedFile];
      });
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (previewFileId === id) setPreviewFileId(null);
  }, [previewFileId]);

  // ─── Drag & Drop ──────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  // ─── Analysis ─────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) {
      toast.error('يرجى رفع ملف واحد على الأقل');
      return;
    }
    // Check that all files have content loaded
    const filesWithoutContent = files.filter((f) => !f.content);
    if (filesWithoutContent.length > 0) {
      toast.error('يرجى الانتظار حتى يتم تحميل جميع الملفات');
      return;
    }
    if (!prompt.trim()) {
      toast.error('يرجى إدخال سؤال التحليل');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/ai/data-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((f) => ({
            name: f.name,
            content: f.content,
            type: f.type,
          })),
          prompt: prompt.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'فشل في تحليل البيانات');
      }

      const data: DataAnalysisResult = await response.json();
      setResult(data);
      setStep('results');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setError(message);
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [files, prompt]);

  // ─── Reset ────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setFiles([]);
    setPrompt('');
    setResult(null);
    setError(null);
    setStep('upload');
    setExpandedChart(null);
    setPreviewFileId(null);
  }, []);

  // ─── Close handler ────────────────────────────────────────────────
  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      // Delayed reset to allow closing animation
      setTimeout(handleReset, 300);
    }
    onOpenChange(isOpen);
  }, [onOpenChange, handleReset]);

  // ─── Render File Preview Table ─────────────────────────────────────
  const renderFilePreview = (file: UploadedFile) => {
    if (!file.preview || file.preview.length === 0) return null;

    const headers = file.preview[0];
    const rows = file.preview.slice(1);

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden"
      >
        <div className="mt-2 rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted border-b border-border">
            <Table2 className="size-3 text-blue-500" />
            <span className="text-[10px] font-semibold text-muted-foreground">
              معاينة البيانات (أول 5 صفوف)
            </span>
          </div>
          <div className="overflow-x-auto max-h-48">
            <Table className="text-[11px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {headers.map((header, idx) => (
                    <TableHead key={idx} className="px-2 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap h-8">
                      {header || `عمود ${idx + 1}`}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rowIdx) => (
                  <TableRow key={rowIdx} className="hover:bg-muted">
                    {row.map((cell, cellIdx) => (
                      <TableCell key={cellIdx} className="px-2 py-1 whitespace-nowrap h-7" dir="auto">
                        {cell.length > 30 ? cell.slice(0, 28) + '…' : cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-2 py-1 bg-muted border-t border-border">
            <span className="text-[9px] text-muted-foreground">
              {file.preview.length - 1} صفوف معروضة من الملف
            </span>
          </div>
        </div>
      </motion.div>
    );
  };

  // ─── Render Upload Step ────────────────────────────────────────────
  const renderUploadStep = () => (
    <div className="space-y-4">
      {/* File Upload Area */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="size-4 text-blue-500" />
          <span className="text-sm font-semibold">الملفات</span>
        </div>

        {/* Drop Zone or Empty State */}
        {files.length === 0 ? (
          /* Better Empty State */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
              isDragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 scale-[1.01]'
                : 'border-border hover:border-blue-400 dark:hover:border-blue-600 hover:bg-muted'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="hidden"
              aria-label="اختيار ملفات البيانات"
            />

            <motion.div
              animate={isDragOver ? { scale: 1.05 } : { scale: 1 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Animated empty state illustration */}
              <div className="relative mx-auto w-24 h-24">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-full h-full"
                >
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950 dark:to-blue-900 flex items-center justify-center border border-blue-200 dark:border-blue-800">
                    <Database className="size-10 text-blue-500" />
                  </div>
                </motion.div>
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-1 -right-1 size-6 rounded-full bg-blue-500 flex items-center justify-center"
                >
                  <Upload className="size-3 text-white" />
                </motion.div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">
                  {isDragOver ? 'أفلت الملفات هنا' : 'ارفع بياناتك للتحليل'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  اسحب الملفات هنا أو انقر للاختيار
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  CSV, TSV, TXT, XLSX, XLS — حتى 5 ميجابايت للملف
                </p>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Has files - compact upload area */
          <>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
                isDragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 scale-[1.01]'
                  : 'border-border hover:border-blue-400 dark:hover:border-blue-600 hover:bg-muted'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS.join(',')}
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="hidden"
                aria-label="اختيار ملفات البيانات"
              />
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Upload className="size-4" />
                <span>إضافة المزيد من الملفات</span>
              </div>
            </div>

            {/* File List with Preview */}
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                {files.map((file, idx) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-3 rounded-xl bg-muted border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                        <FileSpreadsheet className="size-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => setPreviewFileId(previewFileId === file.id ? null : file.id)}
                          className="text-sm font-medium truncate text-foreground hover:text-blue-600 transition-colors text-right w-full"
                          dir="auto"
                        >
                          {file.name}
                        </button>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(file.size)} • {file.type === 'excel' ? 'Excel' : 'CSV/نصي'}
                          {!file.content && (
                            <span className="text-blue-500 mr-1">• جاري التحميل...</span>
                          )}
                        </p>
                      </div>
                      {file.preview && (
                        <button
                          onClick={() => setPreviewFileId(previewFileId === file.id ? null : file.id)}
                          className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                          aria-label="معاينة البيانات"
                        >
                          <Table2 className="size-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.id);
                        }}
                        className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                        aria-label={`إزالة ${file.name}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>

                    {/* File Content Preview */}
                    <AnimatePresence>
                      {previewFileId === file.id && file.preview && renderFilePreview(file)}
                    </AnimatePresence>
                  </motion.div>
                ))}

                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    {files.length}/{MAX_FILES}
                  </Badge>
                  <span>ملف مرفوع</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Analysis Prompt */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="size-4 text-blue-500" />
          <span className="text-sm font-semibold">سؤال التحليل</span>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="مثال: ما هي الاتجاهات الرئيسية في البيانات؟ أي أعمدة تظهر تبايناً كبيراً؟ ما هي التوصيات بناءً على الأرقام؟"
          rows={3}
          dir="auto"
          className="text-sm resize-none border-border focus-visible:ring-blue-500"
        />
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
          >
            <AlertCircle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analyze Button */}
      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing || files.length === 0 || !prompt.trim() || files.some((f) => !f.content)}
        className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black h-12 text-base font-semibold"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="size-5 ml-2 animate-spin" />
            جاري تحليل البيانات...
          </>
        ) : (
          <>
            <Sparkles className="size-5 ml-2" />
            تحليل البيانات
          </>
        )}
      </Button>
    </div>
  );

  // ─── Render Loading State ──────────────────────────────────────────
  const renderLoading = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
        <Loader2 className="size-5 text-blue-600 dark:text-blue-400 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">جاري التحليل بالذكاء الاصطناعي</p>
          <p className="text-xs text-blue-600 dark:text-blue-400">يتم قراءة البيانات واستخراج الرؤى وتوليد الرسوم البيانية...</p>
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );

  // ─── Render Results Step ───────────────────────────────────────────
  const renderResults = () => {
    if (!result) return null;

    return (
      <div className="space-y-4">
        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-blue-200 dark:border-blue-800 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <FileText className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-bold text-foreground">ملخص التحليل</h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" dir="auto">
                {result.summary}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Key Insights */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-blue-200 dark:border-blue-800 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <Lightbulb className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-bold text-foreground">الرؤى الرئيسية</h3>
                <Badge variant="secondary" className="text-[10px] mr-auto">
                  {result.insights.length} رؤية
                </Badge>
              </div>
              <div className="space-y-2">
                {result.insights?.map((insight, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.08 }}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950"
                  >
                    <span className="flex-shrink-0 size-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <p className="text-sm text-foreground leading-relaxed" dir="auto">{insight}</p>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Charts */}
        {result.charts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-blue-200 dark:border-blue-800 overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                    <BarChart3 className="size-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">الرسوم البيانية</h3>
                  <Badge variant="secondary" className="text-[10px] mr-auto">
                    {result.charts.length} رسم
                  </Badge>
                </div>

                <div className="space-y-3">
                  {result.charts?.map((chart, idx) => {
                    const typeLabel = CHART_TYPE_LABELS[chart.spec.type] || CHART_TYPE_LABELS.bar;
                    const isExpanded = expandedChart === idx;
                    const chartId = `chart-${idx}`;

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + idx * 0.1 }}
                        className="rounded-xl border border-border overflow-hidden bg-card"
                      >
                        {/* Chart Header */}
                        <div className="flex items-center">
                          <button
                            onClick={() => setExpandedChart(isExpanded ? null : idx)}
                            className="flex-1 flex items-center gap-2 p-3 hover:bg-muted transition-colors"
                          >
                            <span className="text-base">{typeLabel.icon}</span>
                            <span className="text-sm font-medium text-foreground flex-1 text-right" dir="auto">
                              {chart.spec.title}
                            </span>
                            <Badge variant="outline" className="text-[10px] flex-shrink-0">
                              {typeLabel.label}
                            </Badge>
                            {isExpanded ? (
                              <ChevronUp className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            )}
                          </button>

                          {/* Download chart PNG button - always visible */}
                          <button
                            onClick={() => downloadChartAsPNG(chart.svg, chart.spec.title)}
                            className="size-8 flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors ml-1 mr-1"
                            aria-label="تحميل الرسم كـ PNG"
                            title="تحميل PNG"
                          >
                            <ImageIcon className="size-3.5" />
                          </button>
                        </div>

                        {/* Chart SVG */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 flex justify-center">
                                <div
                                  id={chartId}
                                  className="w-full max-w-[500px] rounded-lg overflow-hidden border border-border bg-card"
                                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chart.svg) }}
                                />
                              </div>

                              {/* Data Table */}
                              <div className="px-3 pb-3">
                                <div className="rounded-lg border border-border overflow-hidden">
                                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted border-b border-border">
                                    <Table2 className="size-3 text-blue-500" />
                                    <span className="text-[10px] font-semibold text-muted-foreground">بيانات الرسم</span>
                                  </div>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="muted">
                                        <th className="px-2 py-1.5 text-right font-semibold text-muted-foreground">التسمية</th>
                                        <th className="px-2 py-1.5 text-right font-semibold text-muted-foreground">القيمة</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {chart.spec.data.labels?.map((label, i) => (
                                        <tr key={i} className="border-t border-border">
                                          <td className="px-2 py-1.5 text-foreground" dir="auto">{label}</td>
                                          <td className="px-2 py-1.5 font-mono text-foreground">
                                            <span
                                              className="inline-block size-2 rounded-full ml-1.5"
                                              style={{ backgroundColor: chart.spec.colors[i % chart.spec.colors.length] }}
                                            />
                                            {chart.spec.data.values[i].toLocaleString('ar-EG')}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Recommendation */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="border-blue-200 dark:border-blue-800 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <TrendingUp className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-bold text-foreground">التوصيات</h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" dir="auto">
                {result.recommendation}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex-1 h-10"
          >
            <Trash2 className="size-4 ml-2" />
            تحليل جديد
          </Button>
          <Button
            onClick={() => {
              if (!result) return;
              const text = `📊 تحليل البيانات — Anzaro AI\n\n` +
                `📝 الملخص:\n${result.summary}\n\n` +
                `💡 الرؤى:\n${result.insights?.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}\n\n` +
                `📈 التوصيات:\n${result.recommendation}`;

              if (navigator.share) {
                navigator.share({ title: 'تحليل البيانات', text }).catch(() => {
                  navigator.clipboard.writeText(text);
                  toast.success('تم نسخ التحليل!');
                });
              } else {
                navigator.clipboard.writeText(text);
                toast.success('تم نسخ التحليل!');
              }
            }}
            className="flex-1 h-10 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
          >
            <Send className="size-4 ml-2 rotate-180" />
            مشاركة التحليل
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-blue-500" />
            تحليل البيانات
          </DialogTitle>
          <DialogDescription>
            {step === 'upload'
              ? 'ارفع ملفات CSV/Excel واحصل على تحليل ذكي بالذكاء الاصطناعي'
              : 'نتائج تحليل البيانات'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          <motion.div
            key={isAnalyzing ? 'loading' : step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {isAnalyzing ? renderLoading() : step === 'upload' ? renderUploadStep() : renderResults()}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
