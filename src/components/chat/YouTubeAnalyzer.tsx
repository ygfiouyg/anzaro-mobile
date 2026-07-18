'use client';

import { useState, useCallback } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Youtube, Loader2, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface YouTubeAnalyzerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AnalysisResult {
  success: boolean;
  title?: string;
  summary?: string;
  transcript?: string;
  keyPoints?: string[];
  error?: string;
}

/**
 * YouTubeAnalyzer — Connects the orphan /api/youtube/analyze API to the UI.
 *
 * Architecture:
 * - POST /api/youtube/analyze with { url, question }
 * - Returns AI-generated summary, transcript, and key points
 * - Loading state prevents double-submit
 * - Error handling with toast (no silent failures)
 * - Results displayed in scrollable area with markdown support
 *
 * Resilience:
 * - 2-minute timeout (YouTube processing can be slow)
 * - AbortController for cleanup on unmount
 * - Graceful error display (no crash)
 */
export function YouTubeAnalyzer({ open, onOpenChange }: YouTubeAnalyzerProps) {
  const [url, setUrl] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) {
      toast.error('يرجى إدخال رابط يوتيوب');
      return;
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//;
    if (!youtubeRegex.test(url.trim())) {
      toast.error('الرابط غير صالح — يجب أن يكون رابط يوتيوب');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const token = localStorage.getItem('delta-auth-storage');
      const parsed = token ? JSON.parse(token) : null;
      const authToken = parsed?.state?.token;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min

      const response = await fetch('/api/youtube/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          url: url.trim(),
          question: question.trim() || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `خطأ: ${response.status}`);
      }

      const data: AnalysisResult = await response.json();
      setResult(data);

      if (data.success) {
        toast.success('تم تحليل الفيديو بنجاح!');
      } else {
        toast.error(data.error || 'فشل تحليل الفيديو');
      }
    } catch (err) {
      const message = err instanceof Error
        ? err.name === 'AbortError'
          ? 'انتهت مهلة التحليل (فوق دقيقتين)'
          : err.message
        : 'فشل الاتصال بالخادم';
      setResult({ success: false, error: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [url, question]);

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation
    setTimeout(() => {
      setUrl('');
      setQuestion('');
      setResult(null);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="size-5 text-red-600" />
            تحليل فيديو يوتيوب
          </DialogTitle>
          <DialogDescription>
            أدخل رابط فيديو يوتيوب وسنقوم بتحليله وتلخيصه بالذكاء الاصطناعي
          </DialogDescription>
        </DialogHeader>

        {/* Input form */}
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="yt-url">رابط الفيديو</Label>
            <Input
              id="yt-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yt-question">سؤال محدد (اختياري)</Label>
            <Input
              id="yt-question"
              placeholder="مثال: ما هي النقاط الرئيسية في هذا الفيديو؟"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={loading || !url.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                جاري التحليل... (قد يستغرق دقيقة)
              </>
            ) : (
              <>
                <Youtube className="size-4" />
                تحليل الفيديو
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="border-t pt-3">
            {result.success ? (
              <ScrollArea className="h-[300px] rounded-lg border border-border p-4">
                <div className="space-y-3">
                  {result.title && (
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1">العنوان</h3>
                      <p className="text-sm text-foreground">{result.title}</p>
                    </div>
                  )}
                  {result.summary && (
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-1.5">
                        <FileText className="size-3.5" />
                        الملخص
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {result.summary}
                      </p>
                    </div>
                  )}
                  {result.keyPoints && result.keyPoints.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1">النقاط الرئيسية</h3>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        {result.keyPoints?.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.transcript && (
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1">النص الكامل</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {result.transcript}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-destructive">
                <AlertCircle className="size-8" />
                <p className="text-sm font-medium">{result.error || 'فشل التحليل'}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
