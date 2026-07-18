'use client';

import { useState, useMemo } from 'react';
import { ImageIcon, Loader2, Download, X, RefreshCw } from 'lucide-react';
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
  IMAGE_GEN_MODELS,
  POLLINATIONS_IMAGE_MODELS,
  HUGGINGFACE_IMAGE_MODELS,
  ZHIPUAI_IMAGE_MODELS,
  ZAI_IMAGE_MODELS,
  getImageGenModelById,
  type ImageGenModel,
  type ImageModelProvider,
} from '@/lib/image-models';
import { toast } from 'sonner';

interface ImageGenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const IMAGE_SIZES = [
  { value: '1024x1024', label: '1024×1024' },
  { value: '768x1344', label: '768×1344' },
  { value: '864x1152', label: '864×1152' },
  { value: '1344x768', label: '1344×768' },
  { value: '1152x864', label: '1152×864' },
  { value: '1440x720', label: '1440×720' },
  { value: '720x1440', label: '720×1440' },
];

/** Provider group config for the Select dropdown */
const PROVIDER_GROUPS: {
  provider: ImageModelProvider;
  models: ImageGenModel[];
  icon: string;
  labelAr: string;
  labelEn: string;
  hint: string;
}[] = [
  {
    provider: 'pollinations',
    models: POLLINATIONS_IMAGE_MODELS,
    icon: '🌸',
    labelAr: 'بولينيشنز',
    labelEn: 'Pollinations',
    hint: 'مجاني',
  },
  {
    provider: 'zhipuai',
    models: ZHIPUAI_IMAGE_MODELS,
    icon: '🇨🇳',
    labelAr: 'زيپو أي',
    labelEn: 'ZhipuAI',
    hint: 'فلاش فقط',
  },
  {
    provider: 'huggingface',
    models: HUGGINGFACE_IMAGE_MODELS,
    icon: '🤗',
    labelAr: 'هاجفيس',
    labelEn: 'HuggingFace',
    hint: 'FLUX.1 Schnell',
  },
  {
    provider: 'zai',
    models: ZAI_IMAGE_MODELS,
    icon: '🤖',
    labelAr: 'زي-إيه-آي',
    labelEn: 'Z-AI SDK',
    hint: 'موثوق',
  },
];

export function ImageGenDialog({ open, onOpenChange }: ImageGenDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null); // download URL
  const [generatedDataUrl, setGeneratedDataUrl] = useState<string | null>(null); // base64 data URL for instant display
  const [generatedAssetId, setGeneratedAssetId] = useState<string | null>(null);
  const [generatedFileSize, setGeneratedFileSize] = useState<number>(0);
  const [generatedModel, setGeneratedModel] = useState<string>('');
  const [imageLoadError, setImageLoadError] = useState(false);
  const { token } = useAuthStore();
  const { addGeneratedFile } = useChatStore();

  // Default: pollinations-flux (free, reliable)
  const [selectedModel, setSelectedModel] = useState('pollinations-flux');

  /**
   * Display URL: Use the base64 data URL directly for instant, reliable display.
   * Falls back to the download endpoint URL only if data URL is not available.
   */
  const displayImageUrl = generatedDataUrl || (generatedImageUrl && token ? `${generatedImageUrl}?token=${token}` : null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('يرجى إدخال وصف الصورة');
      return;
    }

    setIsGenerating(true);
    setGeneratedImageUrl(null);
    setGeneratedDataUrl(null);
    setGeneratedAssetId(null);
    setGeneratedFileSize(0);
    setGeneratedModel('');
    setImageLoadError(false);

    try {
      // Set a longer timeout for image generation (60 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('/api/ai/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: prompt.trim(), size, model: selectedModel }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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

      const imageUrl = data.imageUrl;
      const imageDataUrl = data.imageBase64 || null; // base64 data URL for instant display
      const assetId = data.assetId;
      const fileSize = data.size || 0;
      const modelUsed = data.model || '';

      setGeneratedImageUrl(imageUrl);
      setGeneratedDataUrl(imageDataUrl);
      setGeneratedAssetId(assetId);
      setGeneratedFileSize(fileSize);
      setGeneratedModel(modelUsed);
      setImageLoadError(false);

      // Add to generated files store
      if (assetId) {
        addGeneratedFile({
          id: assetId,
          name: `${prompt.trim().slice(0, 30)}.jpg`,
          url: imageUrl,
          type: 'image',
          createdAt: new Date().toISOString(),
          size: fileSize,
        });
      }

      toast.success('تم توليد الصورة بنجاح!');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('انتهت مهلة التوليد. يرجى المحاولة مرة أخرى.');
      } else {
        toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء توليد الصورة');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImageUrl || !token) return;
    // Use the download endpoint with download=1 and token
    const downloadUrl = `${generatedImageUrl}?download=1&token=${token}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `deltaai-image-${Date.now()}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after animation
    setTimeout(() => {
      setPrompt('');
      setGeneratedImageUrl(null);
      setGeneratedDataUrl(null);
      setGeneratedAssetId(null);
      setGeneratedFileSize(0);
      setGeneratedModel('');
      setImageLoadError(false);
      setSize('1024x1024');
      // Reset to default model
      setSelectedModel('pollinations-flux');
    }, 300);
  };

  // Find the selected model config for displaying info
  const selectedModelConfig = useMemo(
    () => getImageGenModelById(selectedModel),
    [selectedModel]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-5 text-blue-500" />
            توليد صورة بالذكاء الاصطناعي
          </DialogTitle>
          <DialogDescription>
            أدخل وصف الصورة وسيتم توليدها باستخدام الذكاء الاصطناعي
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Prompt Input */}
          <div className="space-y-2">
            <Label htmlFor="image-prompt">وصف الصورة</Label>
            <Input
              id="image-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="مثال: قطة لطيفة تجلس على حائط..."
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
          <div className="space-y-2">
            <Label>نموذج التوليد</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isGenerating}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_GROUPS.map((group) => (
                  <SelectGroup key={group.provider}>
                    <SelectLabel className="flex items-center gap-1.5 font-semibold text-xs">
                      <span>{group.icon}</span>
                      <span>{group.labelEn}</span>
                      <span className="text-muted-foreground font-normal">({group.hint})</span>
                    </SelectLabel>
                    {group.models.filter(m => m.available).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-1.5">
                          <span>{m.icon}</span>
                          <span>{m.nameEn}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {/* Show model info */}
            {selectedModelConfig && (
              <p className="text-[11px] text-muted-foreground mt-1">
                🎨 {selectedModelConfig.nameEn} • Quality: {'⭐'.repeat(selectedModelConfig.quality)} • Speed: {'⚡'.repeat(selectedModelConfig.speed)}
                {selectedModelConfig.supportsEdit && ' • ✏️ Supports editing'}
              </p>
            )}
          </div>

          {/* Size Selector */}
          <div className="space-y-2">
            <Label>حجم الصورة</Label>
            <Select value={size} onValueChange={setSize} disabled={isGenerating}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_SIZES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                جاري التوليد...
              </>
            ) : (
              <>
                <ImageIcon className="size-4 ml-2" />
                توليد الصورة
              </>
            )}
          </Button>

          {/* Preview — use authenticated URL directly in <img src> */}
          {generatedImageUrl && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                {imageLoadError ? (
                  <div className="flex flex-col items-center justify-center h-40 text-destructive text-sm p-4 text-center gap-2">
                    <span>فشل تحميل الصورة.</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      <RefreshCw className="size-3.5 ml-1.5" />
                      إعادة المحاولة
                    </Button>
                  </div>
                ) : displayImageUrl ? (
                  <img
                    src={displayImageUrl}
                    alt="Generated image"
                    className="w-full h-auto max-h-[60vh] object-contain"
                    onError={() => {
                      // If data URL fails, try download URL as fallback
                      if (generatedDataUrl && generatedImageUrl && token) {
                        setGeneratedDataUrl(null); // Clear data URL to use download URL
                      } else {
                        setImageLoadError(true);
                      }
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                    <Loader2 className="size-5 ml-2 animate-spin" />
                    جاري تحميل الصورة...
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 left-2 size-8 background "
                  onClick={() => {
                    setGeneratedImageUrl(null);
                    setGeneratedDataUrl(null);
                    setGeneratedAssetId(null);
                    setImageLoadError(false);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
              {/* Image info */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {generatedModel && (
                  <span className="bg-muted px-2 py-0.5 rounded">🤖 {generatedModel}</span>
                )}
                {generatedFileSize > 0 && (
                  <span>{(generatedFileSize / 1024).toFixed(1)} KB</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  className="flex-1"
                >
                  <Download className="size-4 ml-2" />
                  تحميل الصورة
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
