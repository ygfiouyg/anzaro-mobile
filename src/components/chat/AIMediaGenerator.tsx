'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Wand2,
  Loader2,
  Download,
  RefreshCw,
  FolderOpen,
  ImageIcon,
  Video,
  Sparkles,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
  IMAGE_GEN_MODELS,
  POLLINATIONS_IMAGE_MODELS,
  HUGGINGFACE_IMAGE_MODELS,
  ZHIPUAI_IMAGE_MODELS,
  ZAI_IMAGE_MODELS,
  getImageGenModelById,
  type ImageModelProvider,
  type ImageGenModel,
} from '@/lib/image-models';
import {
  VIDEO_GEN_MODELS,
  HF_VIDEO_MODELS,
  DEFAULT_VIDEO_MODEL,
  getVideoGenModelById,
} from '@/lib/video-models';
import {
  optimizePrompt,
  detectImageModelFamily,
  detectVideoModelFamily,
  type MediaCategory,
} from '@/lib/prompt-engine';
import { toast } from 'sonner';

interface AIMediaGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the prompt (e.g. from chat command) */
  initialPrompt?: string;
  /** Pre-select the tab */
  initialTab?: 'image' | 'video';
}

const IMAGE_SIZES = [
  { value: '1024x1024', label: '1024×1024' },
  { value: '768x1344', label: '768×1344' },
  { value: '1344x768', label: '1344×768' },
  { value: '1440x720', label: '1440×720' },
];

const IMAGE_PROVIDER_GROUPS: {
  provider: ImageModelProvider;
  models: ImageGenModel[];
  icon: string;
  labelEn: string;
  hint: string;
}[] = [
  { provider: 'pollinations', models: POLLINATIONS_IMAGE_MODELS, icon: '🌸', labelEn: 'Pollinations', hint: 'مجاني' },
  { provider: 'huggingface', models: HUGGINGFACE_IMAGE_MODELS, icon: '🤗', labelEn: 'HuggingFace', hint: 'FLUX.1 Schnell' },
  { provider: 'zhipuai', models: ZHIPUAI_IMAGE_MODELS, icon: '🇨🇳', labelEn: 'ZhipuAI', hint: 'فلاش فقط' },
  { provider: 'zai', models: ZAI_IMAGE_MODELS, icon: '🤖', labelEn: 'Z-AI SDK', hint: 'موثوق' },
];

const VIDEO_QUALITIES = [
  { value: 'quality', label: 'جودة عالية' },
  { value: 'speed', label: 'سرعة عالية' },
];

const VIDEO_DURATIONS = [
  { value: '5', label: '5 ثوانٍ' },
  { value: '6', label: '6 ثوانٍ' },
  { value: '8', label: '8 ثوانٍ' },
];

const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 84; // 84 * 5s = 7 minutes max for video

// Custom model type (from aggregator/admin)
interface CustomMediaModel {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  provider: string;
  isFree: boolean;
  icon: string;
  description: string | null;
  modelId: string | null;
  apiFormat: string;
  baseUrl: string;
}

export function AIMediaGenerator({ open, onOpenChange, initialPrompt, initialTab }: AIMediaGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'image' | 'video'>(initialTab || 'image');
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [optimizedPrompt, setOptimizedPrompt] = useState('');
  const [showOptimized, setShowOptimized] = useState(false);

  // Image state
  const [imageModel, setImageModel] = useState('pollinations-flux');
  const [imageSize, setImageSize] = useState('1024x1024');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
  const [generatedImageDownloadUrl, setGeneratedImageDownloadUrl] = useState<string | null>(null);
  const [generatedImageAssetId, setGeneratedImageAssetId] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [generatedImageModel, setGeneratedImageModel] = useState('');

  // Video state
  const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [videoQuality, setVideoQuality] = useState('quality');
  const [videoDuration, setVideoDuration] = useState('5');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedVideoAssetId, setGeneratedVideoAssetId] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [videoProvider, setVideoProvider] = useState<string>('zai');

  const { token } = useAuthStore();
  const { addGeneratedFile } = useChatStore();

  // Custom models state
  const [customImageModels, setCustomImageModels] = useState<CustomMediaModel[]>([]);
  const [customVideoModels, setCustomVideoModels] = useState<CustomMediaModel[]>([]);

  // Fetch custom models when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch('/api/ai/custom-models')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.models) {
          setCustomImageModels(data.models.filter((m: CustomMediaModel) => m.category === 'image'));
          setCustomVideoModels(data.models.filter((m: CustomMediaModel) => m.category === 'video'));
        }
      })
      .catch(() => {});
  }, [open]);

  // Compute optimized prompt when user types
  const computeOptimized = useCallback((raw: string, tab: MediaCategory, modelId: string) => {
    if (!raw.trim()) return '';
    const family = tab === 'image'
      ? detectImageModelFamily(modelId)
      : detectVideoModelFamily(modelId);
    return optimizePrompt(raw, {
      category: tab,
      modelFamily: family,
      isArabic: true,
    });
  }, []);

  const handlePromptChange = (value: string) => {
    setPrompt(value);
    const opt = computeOptimized(value, activeTab, activeTab === 'image' ? imageModel : videoModel);
    setOptimizedPrompt(opt);
  };

  const handleModelChange = (modelId: string, tab: MediaCategory) => {
    if (tab === 'image') {
      setImageModel(modelId);
    } else {
      setVideoModel(modelId);
      const mc = getVideoGenModelById(modelId);
      if (mc && parseInt(videoDuration) > mc.maxDuration) {
        setVideoDuration(String(mc.maxDuration));
      }
    }
    // Recompute optimized prompt
    const opt = computeOptimized(prompt, tab, modelId);
    setOptimizedPrompt(opt);
  };

  // ─── Image Generation ──────────────────────────────────────────────
  const handleGenerateImage = async () => {
    if (!prompt.trim()) {
      toast.error('يرجى إدخال وصف الصورة');
      return;
    }

    setIsGeneratingImage(true);
    setGeneratedImageBase64(null);
    setGeneratedImageDownloadUrl(null);
    setGeneratedImageAssetId(null);
    setImageLoadError(false);
    setGeneratedImageModel('');

    const finalPrompt = showOptimized && optimizedPrompt ? optimizedPrompt : prompt.trim();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 420000); // 7 minutes for HF/GitHub cold starts

      const response = await fetch('/api/ai/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: finalPrompt, size: imageSize, model: imageModel }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `خطأ في الخادم (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (response.status === 504 || response.status === 502) {
            errorMessage = 'انتهت مهلة الخادم. يرجى المحاولة مرة أخرى.';
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Use the base64 data URL for instant display (no round-trip needed)
      if (data.imageBase64) {
        setGeneratedImageBase64(data.imageBase64);
        setImageLoadError(false);
      } else {
        // Fallback to download URL if no base64 provided
        setGeneratedImageDownloadUrl(data.imageUrl);
      }

      setGeneratedImageAssetId(data.assetId);
      setGeneratedImageModel(data.model || '');

      if (data.assetId) {
        addGeneratedFile({
          id: data.assetId,
          name: `${prompt.trim().slice(0, 30)}.jpg`,
          url: data.imageUrl,
          type: 'image',
          createdAt: new Date().toISOString(),
          size: data.size || 0,
        });
      }

      toast.success('تم توليد الصورة بنجاح!');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('انتهت مهلة التوليد.');
      } else {
        toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء توليد الصورة');
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // ─── Video Generation ──────────────────────────────────────────────
  const pollForVideoStatus = async (taskId: string, promptText: string, provider: string) => {
    let attempts = 0;

    // Calculate max poll attempts based on model estimated time
    const currentModel = getVideoGenModelById(videoModel);
    const estimatedTime = currentModel?.estimatedTime || 120; // default 2 min
    const maxAttempts = Math.max(30, Math.ceil(estimatedTime / (POLL_INTERVAL / 1000)));

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setIsGeneratingVideo(false);
        toast.error('انتهت مهلة توليد الفيديو.');
        return;
      }

      attempts++;
      setVideoProgress(Math.min(90, attempts * (90 / maxAttempts)));

      try {
        const response = await fetch(`/api/ai/video/status?taskId=${taskId}&prompt=${encodeURIComponent(promptText)}&provider=${encodeURIComponent(provider)}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });

        if (!response.ok) {
          setIsGeneratingVideo(false);
          toast.error('خطأ في الاستعلام عن حالة الفيديو');
          return;
        }

        const data = await response.json();

        if (data.taskStatus === 'PROCESSING') {
          setTimeout(poll, POLL_INTERVAL);
          return;
        }

        if (data.taskStatus === 'FAIL') {
          setIsGeneratingVideo(false);
          toast.error(data.error || 'فشل في توليد الفيديو');
          return;
        }

        if (data.taskStatus === 'SUCCESS' && data.videoUrl) {
          setGeneratedVideoUrl(data.videoUrl);
          setGeneratedVideoAssetId(data.assetId);
          setVideoLoadError(false);
          setVideoProgress(100);

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

          setIsGeneratingVideo(false);
          toast.success('تم توليد الفيديو بنجاح!');
          return;
        }

        setIsGeneratingVideo(false);
        toast.error('حدث خطأ غير متوقع');
      } catch {
        setIsGeneratingVideo(false);
        toast.error('خطأ في الاستعلام عن حالة الفيديو');
      }
    };

    setTimeout(poll, POLL_INTERVAL);
  };

  const handleGenerateVideo = async () => {
    if (!prompt.trim()) {
      toast.error('يرجى إدخال وصف الفيديو');
      return;
    }

    setIsGeneratingVideo(true);
    setVideoProgress(5);
    setGeneratedVideoUrl(null);
    setGeneratedVideoAssetId(null);
    setVideoLoadError(false);

    const finalPrompt = showOptimized && optimizedPrompt ? optimizedPrompt : prompt.trim();

    try {
      const response = await fetch('/api/ai/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          quality: videoQuality,
          duration: parseInt(videoDuration),
          model: videoModel,
        }),
      });

      if (!response.ok) {
        let errorMessage = `خطأ في الخادم (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (response.status === 504 || response.status === 502) {
            errorMessage = 'انتهت مهلة الخادم.';
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.taskId) {
        setVideoProgress(10);
        setVideoProvider(data.provider || 'zai');
        toast.info('تم بدء توليد الفيديو، قد يستغرق بضع دقائق...');
        pollForVideoStatus(data.taskId, prompt.trim(), data.provider || 'zai');
      } else if (data.videoUrl) {
        // Direct video URL (HuggingFace Gradio returns video directly)
        setGeneratedVideoUrl(data.videoUrl);
        setGeneratedVideoAssetId(data.assetId);
        setVideoLoadError(false);
        setVideoProgress(100);

        if (data.assetId) {
          addGeneratedFile({
            id: data.assetId,
            name: `${prompt.trim().slice(0, 30)}.mp4`,
            url: data.videoUrl,
            type: 'video',
            createdAt: new Date().toISOString(),
            size: data.size || 0,
          });
        }

        setIsGeneratingVideo(false);
        toast.success('تم توليد الفيديو بنجاح!');
      } else {
        throw new Error('لم يتم استلام معرف المهمة');
      }
    } catch (error) {
      setIsGeneratingVideo(false);
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء توليد الفيديو');
    }
  };

  // ─── Download Handlers ─────────────────────────────────────────────
  const handleDownloadImage = () => {
    const downloadUrl = generatedImageDownloadUrl || generatedImageBase64;
    if (!downloadUrl || !token) return;

    if (downloadUrl.startsWith('data:')) {
      // Base64 data URL — create a blob and download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `deltaai-image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // Download endpoint URL
      const url = `${downloadUrl}?download=1&token=${token}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `deltaai-image-${Date.now()}.jpg`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleDownloadVideo = () => {
    if (!generatedVideoUrl || !token) return;
    const downloadUrl = `${generatedVideoUrl}?download=1&token=${token}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `deltaai-video-${Date.now()}.mp4`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenInFiles = () => {
    toast.success('تم حفظ الملف في ملفاتك! افتح لوحة الملفات من الشريط الجانبي.');
  };

  const handleOpenInNewTab = () => {
    const url = generatedImageDownloadUrl;
    if (!url || !token) return;
    window.open(`${url}?token=${token}`, '_blank');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setPrompt('');
      setOptimizedPrompt('');
      setShowOptimized(false);
      setGeneratedImageBase64(null);
      setGeneratedImageDownloadUrl(null);
      setGeneratedImageAssetId(null);
      setImageLoadError(false);
      setGeneratedImageModel('');
      setGeneratedVideoUrl(null);
      setGeneratedVideoAssetId(null);
      setVideoLoadError(false);
      setVideoProgress(0);
      setActiveTab('image');
    }, 300);
  };

  // Determine the image display source
  const imageDisplaySrc = generatedImageBase64 || (generatedImageDownloadUrl && token ? `${generatedImageDownloadUrl}?token=${token}` : null);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-blue-500" />
            مولد الوسائط الذكي
          </DialogTitle>
          <DialogDescription>
            اكتب وصفك بالعربي أو الإنجليزي والمحرك هيحسّنه تلقائي
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'image' | 'video')} dir="rtl">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="image" className="flex items-center gap-2">
              <ImageIcon className="size-4" />
              صورة
            </TabsTrigger>
            <TabsTrigger value="video" className="flex items-center gap-2">
              <Video className="size-4" />
              فيديو
            </TabsTrigger>
          </TabsList>

          {/* ─── Image Tab ──────────────────────────────────────────── */}
          <TabsContent value="image" className="space-y-4 mt-4">
            {/* Prompt Input */}
            <div className="space-y-2">
              <Label>وصف الصورة</Label>
              <Textarea
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="مثال: كلب بيضحك، أو غروب على البحر، أو مدينة المستقبل..."
                dir="auto"
                disabled={isGeneratingImage}
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isGeneratingImage && prompt.trim()) {
                    e.preventDefault();
                    handleGenerateImage();
                  }
                }}
              />
            </div>

            {/* Optimized Prompt Toggle */}
            {optimizedPrompt && optimizedPrompt !== prompt.trim() && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowOptimized(!showOptimized)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Sparkles className="size-3" />
                  {showOptimized ? 'الوصف المحسّن (اضغط للرجوع للأصلي)' : 'عرض الوصف المحسّن بالذكاء الاصطناعي'}
                  <ChevronDown className={`size-3 transition-transform ${showOptimized ? 'rotate-180' : ''}`} />
                </button>
                {showOptimized && (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed" dir="ltr">
                      {optimizedPrompt}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Image Model & Size */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">النموذج</Label>
                <Select value={imageModel} onValueChange={(v) => handleModelChange(v, 'image')} disabled={isGeneratingImage}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customImageModels.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                          ⚡ نماذج مخصصة ({customImageModels.length})
                        </SelectLabel>
                        {customImageModels.map((m) => (
                          <SelectItem key={`custom:image:${m.id}`} value={`custom:image:${m.id}`} className="text-xs">
                            {m.icon || '🖼️'} {m.name} {m.isFree ? '🆓' : ''}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {IMAGE_PROVIDER_GROUPS.map((group) => (
                      group.models.length > 0 && (
                        <SelectGroup key={group.provider}>
                          <SelectLabel className="text-[10px] font-semibold">
                            {group.icon} {group.labelEn} ({group.hint})
                          </SelectLabel>
                          {group.models.filter(m => m.available).map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-xs">
                              {m.icon} {m.nameEn}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">الحجم</Label>
                <Select value={imageSize} onValueChange={setImageSize} disabled={isGeneratingImage}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage || !prompt.trim()}
              className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
            >
              {isGeneratingImage ? (
                <><Loader2 className="size-4 ml-2 animate-spin" />جاري التوليد...</>
              ) : (
                <><Sparkles className="size-4 ml-2" />توليد الصورة</>
              )}
            </Button>

            {/* Image Result */}
            {(generatedImageBase64 || generatedImageDownloadUrl) && (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                  {imageLoadError ? (
                    <div className="flex items-center justify-center h-40 text-destructive text-sm p-4">فشل تحميل الصورة</div>
                  ) : imageDisplaySrc ? (
                    <img
                      src={imageDisplaySrc}
                      alt="Generated"
                      className="w-full h-auto max-h-[50vh] object-contain"
                      onError={() => setImageLoadError(true)}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-40"><Loader2 className="size-5 ml-2 animate-spin" /></div>
                  )}
                </div>
                {/* Image Info */}
                <div className="flex items-center gap-2 flex-wrap">
                  {generatedImageModel && <Badge variant="secondary" className="text-[10px]">🤖 {generatedImageModel}</Badge>}
                  {showOptimized && <Badge variant="secondary" className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">✨ محسّن</Badge>}
                </div>
                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleDownloadImage} className="flex-1 text-xs">
                    <Download className="size-3.5 ml-1.5" />
                    تحميل
                  </Button>
                  <Button variant="outline" onClick={handleOpenInNewTab} className="flex-1 text-xs" disabled={!generatedImageDownloadUrl}>
                    <ExternalLink className="size-3.5 ml-1.5" />
                    فتح
                  </Button>
                  <Button variant="outline" onClick={handleOpenInFiles} className="flex-1 text-xs">
                    <FolderOpen className="size-3.5 ml-1.5" />
                    ملفاتي
                  </Button>
                  <Button variant="outline" onClick={handleGenerateImage} disabled={isGeneratingImage} className="flex-1 text-xs">
                    <RefreshCw className="size-3.5 ml-1.5" />
                    أعادة
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─── Video Tab ──────────────────────────────────────────── */}
          <TabsContent value="video" className="space-y-4 mt-4">
            {/* Prompt Input */}
            <div className="space-y-2">
              <Label>وصف الفيديو</Label>
              <Textarea
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="مثال: ناس بيلعبو على البحر، أو قط يتجول في حديقة..."
                dir="auto"
                disabled={isGeneratingVideo}
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isGeneratingVideo && prompt.trim()) {
                    e.preventDefault();
                    handleGenerateVideo();
                  }
                }}
              />
            </div>

            {/* Optimized Prompt Toggle */}
            {optimizedPrompt && optimizedPrompt !== prompt.trim() && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowOptimized(!showOptimized)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Sparkles className="size-3" />
                  {showOptimized ? 'الوصف المحسّن (اضغط للرجوع للأصلي)' : 'عرض الوصف المحسّن بالذكاء الاصطناعي'}
                  <ChevronDown className={`size-3 transition-transform ${showOptimized ? 'rotate-180' : ''}`} />
                </button>
                {showOptimized && (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed" dir="ltr">
                      {optimizedPrompt}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Video Model & Quality & Duration */}
            <div className="space-y-1.5">
              <Label className="text-xs">النموذج</Label>
              <Select value={videoModel} onValueChange={(v) => handleModelChange(v, 'video')} disabled={isGeneratingVideo}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customVideoModels.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                        ⚡ نماذج مخصصة ({customVideoModels.length})
                      </SelectLabel>
                      {customVideoModels.map((m) => (
                        <SelectItem key={`custom:video:${m.id}`} value={`custom:video:${m.id}`} className="text-xs">
                          {m.icon || '🎬'} {m.name} {m.isFree ? '🆓' : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel className="text-[10px] font-semibold">🤗 HuggingFace — بدون قيود محتوى</SelectLabel>
                    {HF_VIDEO_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.icon} {m.nameEn}
                        {m.supportsImageToVideo ? ' 🖼️→🎬' : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">الجودة</Label>
                <Select value={videoQuality} onValueChange={setVideoQuality} disabled={isGeneratingVideo}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_QUALITIES.map((q) => (
                      <SelectItem key={q.value} value={q.value} className="text-xs">{q.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المدة</Label>
                <Select value={videoDuration} onValueChange={setVideoDuration} disabled={isGeneratingVideo}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo || !prompt.trim()}
              className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
            >
              {isGeneratingVideo ? (
                <><Loader2 className="size-4 ml-2 animate-spin" />جاري التوليد... {Math.round(videoProgress)}%</>
              ) : (
                <><Sparkles className="size-4 ml-2" />توليد الفيديو</>
              )}
            </Button>

            {/* Progress Bar */}
            {isGeneratingVideo && (
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                  style={{ width: `${videoProgress}%` }}
                />
              </div>
            )}

            {/* Video Result */}
            {generatedVideoUrl && !isGeneratingVideo && (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden border border-border bg-black">
                  {videoLoadError ? (
                    <div className="flex items-center justify-center h-40 text-destructive text-sm p-4">فشل تحميل الفيديو</div>
                  ) : generatedVideoUrl && token ? (
                    <video
                      src={`${generatedVideoUrl}?token=${token}`}
                      controls
                      className="w-full max-h-80"
                      playsInline
                      onError={() => setVideoLoadError(true)}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-40"><Loader2 className="size-5 ml-2 animate-spin" /></div>
                  )}
                </div>
                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleDownloadVideo} className="flex-1 text-xs">
                    <Download className="size-3.5 ml-1.5" />
                    تحميل
                  </Button>
                  <Button variant="outline" onClick={() => { if (generatedVideoUrl && token) window.open(`${generatedVideoUrl}?token=${token}`, '_blank'); }} className="flex-1 text-xs">
                    <ExternalLink className="size-3.5 ml-1.5" />
                    فتح
                  </Button>
                  <Button variant="outline" onClick={handleOpenInFiles} className="flex-1 text-xs">
                    <FolderOpen className="size-3.5 ml-1.5" />
                    ملفاتي
                  </Button>
                  <Button variant="outline" onClick={handleGenerateVideo} disabled={isGeneratingVideo} className="flex-1 text-xs">
                    <RefreshCw className="size-3.5 ml-1.5" />
                    أعادة
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
