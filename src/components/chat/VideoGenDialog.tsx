'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Video, Loader2, Download, X, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  VIDEO_GEN_MODELS,
  HF_VIDEO_MODELS,
  DEFAULT_VIDEO_MODEL,
  getVideoGenModelById,
  type VideoGenModel,
  type VideoModelProvider,
} from '@/lib/video-models';
import { toast } from 'sonner';

interface VideoGenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VIDEO_QUALITIES = [
  { value: 'quality', label: 'جودة عالية' },
  { value: 'speed', label: 'سرعة عالية' },
];

const VIDEO_DURATIONS = [
  { value: '5', label: '5 ثوانٍ' },
  { value: '6', label: '6 ثوانٍ' },
  { value: '8', label: '8 ثوانٍ' },
  { value: '10', label: '10 ثوانٍ' },
];

const DEFAULT_MODEL = DEFAULT_VIDEO_MODEL;

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 84; // 7 minutes max

export function VideoGenDialog({ open, onOpenChange }: VideoGenDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState('quality');
  const [duration, setDuration] = useState('5');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const pollCountRef = useRef(0);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);
  const { token } = useAuthStore();
  const { addGeneratedFile } = useChatStore();

  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

  // Get the currently selected model config
  const selectedModelConfig = useMemo(
    () => getVideoGenModelById(selectedModel),
    [selectedModel],
  );

  // Compute available durations based on selected model's maxDuration
  const availableDurations = useMemo(() => {
    if (!selectedModelConfig) return VIDEO_DURATIONS.slice(0, 1); // just 5s
    return VIDEO_DURATIONS.filter(
      (d) => parseInt(d.value) <= selectedModelConfig.maxDuration,
    );
  }, [selectedModelConfig]);

  // Clamp duration if the selected model's maxDuration changes
  const clampedDuration = useMemo(() => {
    if (!selectedModelConfig) return '5';
    const dur = parseInt(duration);
    if (dur > selectedModelConfig.maxDuration) {
      // Pick the largest available duration
      const max = availableDurations[availableDurations.length - 1];
      return max?.value ?? '5';
    }
    return duration;
  }, [duration, selectedModelConfig, availableDurations]);

  /**
   * Build the authenticated display URL for the generated video.
   * We use the download endpoint with ?token= so the browser can
   * fetch the video directly via <video src> — no fragile blob-URL dance.
   */
  const authenticatedVideoUrl = videoUrl && token
    ? `${videoUrl}?token=${token}`
    : null;

  const pollForVideoStatus = useCallback(async (taskId: string, promptText: string) => {
    pollCountRef.current = 0;

    const poll = async () => {
      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        setIsGenerating(false);
        toast.error('انتهت مهلة توليد الفيديو. يرجى المحاولة مرة أخرى.');
        return;
      }

      pollCountRef.current++;
      setProgress(Math.min(90, pollCountRef.current * (90 / MAX_POLL_ATTEMPTS)));

      try {
        const response = await fetch(`/api/ai/video/status?taskId=${taskId}&prompt=${encodeURIComponent(promptText)}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          // Handle non-JSON error responses gracefully
          setIsGenerating(false);
          toast.error('حدث خطأ أثناء الاستعلام عن حالة الفيديو');
          return;
        }

        const data = await response.json();

        if (data.taskStatus === 'PROCESSING') {
          pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL);
          return;
        }

        if (data.taskStatus === 'FAIL') {
          setIsGenerating(false);
          toast.error(data.error || 'فشل في توليد الفيديو');
          return;
        }

        if (data.taskStatus === 'SUCCESS' && data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setAssetId(data.assetId);
          setVideoLoadError(false);
          setProgress(100);

          // Add to generated files store
          if (data.assetId) {
            addGeneratedFile({
              id: data.assetId,
              name: `${promptText.slice(0, 30)}.mp4`,
              url: data.videoUrl,
              type: 'video',
              createdAt: new Date().toISOString(),
              size: data.size || 0,
            });
          }

          setIsGenerating(false);
          toast.success('تم توليد الفيديو بنجاح!');
          return;
        }

        // Handle error response with taskStatus SUCCESS but no videoUrl
        if (data.taskStatus === 'SUCCESS' && !data.videoUrl) {
          setIsGenerating(false);
          toast.error(data.error || 'تم توليد الفيديو لكن لم يتم العثور على الرابط');
          return;
        }

        // Unknown state
        setIsGenerating(false);
        toast.error('حدث خطأ غير متوقع');
      } catch {
        setIsGenerating(false);
        toast.error('حدث خطأ أثناء الاستعلام عن حالة الفيديو');
      }
    };

    pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL);
  }, [token, addGeneratedFile]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('يرجى إدخال وصف الفيديو');
      return;
    }

    setIsGenerating(true);
    setProgress(5);
    setVideoUrl(null);
    setAssetId(null);
    setVideoLoadError(false);

    try {
      const response = await fetch('/api/ai/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          quality,
          duration: parseInt(clampedDuration),
          model: selectedModel,
        }),
      });

      // Handle non-JSON responses (HTML error pages from gateway/timeout)
      if (!response.ok) {
        let errorMessage = `خطأ في الخادم (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response is not JSON (e.g., HTML error page from gateway/proxy)
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
        setProgress(10);
        toast.info('تم بدء توليد الفيديو، قد يستغرق بضع دقائق...');
        pollForVideoStatus(data.taskId, prompt.trim());
      } else {
        throw new Error('لم يتم استلام معرف المهمة');
      }
    } catch (error) {
      setIsGenerating(false);
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء توليد الفيديو');
    }
  };

  const handleDownload = () => {
    if (!videoUrl || !token) return;
    const downloadUrl = `${videoUrl}?download=1&token=${token}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `deltaai-video-${Date.now()}.mp4`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    // If current duration exceeds the new model's maxDuration, clamp it
    const modelConfig = getVideoGenModelById(value);
    if (modelConfig) {
      const dur = parseInt(duration);
      if (dur > modelConfig.maxDuration) {
        setDuration(String(modelConfig.maxDuration));
      }
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setPrompt('');
      setQuality('quality');
      setDuration('5');
      setVideoUrl(null);
      setAssetId(null);
      setIsGenerating(false);
      setProgress(0);
      setVideoLoadError(false);
      setSelectedModel(DEFAULT_MODEL);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="size-5 text-blue-500" />
            توليد فيديو بالذكاء الاصطناعي
          </DialogTitle>
          <DialogDescription>
            أدخل وصف الفيديو وسيتم توليده باستخدام الذكاء الاصطناعي
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Prompt Input */}
          <div className="space-y-2">
            <Label htmlFor="video-prompt">وصف الفيديو</Label>
            <Input
              id="video-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="مثال: غروب الشمس على شاطئ البحر مع أمواج هادئة..."
              dir="auto"
              disabled={isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGenerating && prompt.trim()) {
                  handleGenerate();
                }
              }}
            />
          </div>

          {/* Model Selector */}
          <div className="space-y-1.5">
            <Label>نموذج توليد الفيديو</Label>
            <Select value={selectedModel} onValueChange={handleModelChange} disabled={isGenerating}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* HuggingFace Group — THE ONLY PROVIDER (no content filter!) */}
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground">
                    🤗 HuggingFace — بدون قيود محتوى
                  </SelectLabel>
                  {HF_VIDEO_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-1.5">
                        <span>{m.icon}</span>
                        <span>{m.nameEn}</span>
                        {m.supportsImageToVideo && <span className="text-[10px] text-muted-foreground">🖼️→🎬</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {/* Model Info */}
            {selectedModelConfig && (
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                🎬 {selectedModelConfig.nameEn} • الجودة: {'⭐'.repeat(selectedModelConfig.quality)} • السرعة: {'⚡'.repeat(selectedModelConfig.speed)}
                {selectedModelConfig.supportsImageToVideo && ' • 🖼️ صورة ← فيديو'}
              </p>
            )}
          </div>

          {/* Quality & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>الجودة</Label>
              <Select value={quality} onValueChange={setQuality} disabled={isGenerating}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_QUALITIES.map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المدة</Label>
              <Select
                value={clampedDuration}
                onValueChange={setDuration}
                disabled={isGenerating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableDurations.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 ml-2 animate-spin" />
                جاري التوليد... {Math.round(progress)}%
              </>
            ) : (
              <>
                <Video className="size-4 ml-2" />
                توليد الفيديو
              </>
            )}
          </Button>

          {/* Progress Bar */}
          {isGenerating && (
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Preview — use authenticated URL directly in <video src> */}
          {videoUrl && !isGenerating && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-border bg-black">
                {videoLoadError ? (
                  <div className="flex items-center justify-center h-40 text-destructive text-sm p-4 text-center">
                    فشل تحميل الفيديو. يرجى المحاولة مرة أخرى.
                  </div>
                ) : authenticatedVideoUrl ? (
                  <video
                    src={authenticatedVideoUrl}
                    controls
                    className="w-full max-h-80"
                    playsInline
                    onError={() => setVideoLoadError(true)}
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                    <Loader2 className="size-5 ml-2 animate-spin" />
                    جاري تحميل الفيديو...
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 left-2 size-8 background "
                  onClick={() => {
                    setVideoUrl(null);
                    setAssetId(null);
                    setVideoLoadError(false);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  className="flex-1"
                >
                  <Download className="size-4 ml-2" />
                  تحميل الفيديو
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1"
                >
                  <RefreshCw className="size-4 ml-2" />
                  توليد مرة أخرى
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
