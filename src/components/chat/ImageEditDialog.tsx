'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, ImagePlus, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

interface ImageEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const IMAGE_SIZES = [
  { value: '512x512', label: '512×512' },
  { value: '1024x1024', label: '1024×1024' },
  { value: '768x1344', label: '768×1344' },
  { value: '864x1152', label: '864×1152' },
  { value: '1344x768', label: '1344×768' },
  { value: '1152x864', label: '1152×864' },
  { value: '1440x720', label: '1440×720' },
  { value: '720x1440', label: '720×1440' },
];

export function ImageEditDialog({ open, onOpenChange }: ImageEditDialogProps) {
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [isEditing, setIsEditing] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState('');
  const [resultAssetId, setResultAssetId] = useState('');
  const [imageLoadError, setImageLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = useAuthStore((s) => s.token);
  const addGeneratedFile = useChatStore((s) => s.addGeneratedFile);

  const authenticatedImageUrl = resultImageUrl && token
    ? `${resultImageUrl}?token=${token}`
    : null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSourceImage(file);
      const reader = new FileReader();
      reader.onload = () => setSourcePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = async () => {
    if (!sourceImage || !prompt.trim()) {
      toast.error('الصورة والوصف مطلوبان');
      return;
    }

    setIsEditing(true);
    setResultImageUrl('');
    setResultAssetId('');
    setImageLoadError(false);

    try {
      const formData = new FormData();
      formData.append('image', sourceImage);
      formData.append('prompt', prompt);
      formData.append('size', size);

      const response = await fetch('/api/ai/image/edit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      // Handle non-JSON responses (HTML error pages from gateway/timeout)
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

      setResultImageUrl(data.imageUrl);
      setResultAssetId(data.assetId || '');
      setImageLoadError(false);

      if (data.assetId) {
        addGeneratedFile({
          id: data.assetId,
          name: `تعديل صورة - ${prompt.slice(0, 30)}`,
          url: data.imageUrl,
          type: 'image',
          createdAt: new Date().toISOString(),
          size: data.size || 0,
        });
      }

      toast.success('تم تعديل الصورة بنجاح!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل في تعديل الصورة');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDownload = () => {
    if (!resultImageUrl || !token) return;
    const downloadUrl = `${resultImageUrl}?download=1&token=${token}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `deltaai-edited-${Date.now()}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const reset = () => {
    setSourceImage(null);
    setSourcePreview('');
    setPrompt('');
    setResultImageUrl('');
    setResultAssetId('');
    setImageLoadError(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="size-5 text-blue-500" />
            تعديل الصور بالذكاء الاصطناعي
          </DialogTitle>
          <DialogDescription>
            ارفع صورة وأدخل وصف التعديل المطلوب
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Source Image Upload */}
          <div className="space-y-2">
            <Label>الصورة الأصلية</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed dark:border-gray-600 border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              {sourcePreview ? (
                <div className="relative">
                  <img src={sourcePreview} alt="Source" className="max-h-40 mx-auto rounded" />
                  <button
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <div className="py-6">
                  <Upload className="size-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">اضغط لاختيار صورة</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Edit Prompt */}
          <div className="space-y-2">
            <Label>وصف التعديل</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="مثال: أضف نظارات شمسية، غير الخلفية لشاطئ، أزل الخلفية..."
              rows={3}
              dir="auto"
              disabled={isEditing}
            />
          </div>

          {/* Size Selector */}
          <div className="space-y-2">
            <Label>حجم الصورة</Label>
            <Select value={size} onValueChange={setSize} disabled={isEditing}>
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

          {/* Edit Button */}
          <Button
            onClick={handleEdit}
            disabled={isEditing || !sourceImage || !prompt.trim()}
            className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
          >
            {isEditing ? (
              <>
                <Loader2 className="size-4 ml-2 animate-spin" />
                جاري تعديل الصورة...
              </>
            ) : (
              <>
                <ImagePlus className="size-4 ml-2" />
                تعديل الصورة
              </>
            )}
          </Button>

          {/* Result */}
          {resultImageUrl && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                {imageLoadError ? (
                  <div className="flex items-center justify-center h-40 text-destructive text-sm p-4 text-center">
                    فشل تحميل الصورة. يرجى المحاولة مرة أخرى.
                  </div>
                ) : authenticatedImageUrl ? (
                  <img
                    src={authenticatedImageUrl}
                    alt="Edited"
                    className="w-full h-auto max-h-[50vh] object-contain"
                    onError={() => setImageLoadError(true)}
                  />
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 left-2 size-8 background "
                  onClick={() => {
                    setResultImageUrl('');
                    setResultAssetId('');
                    setImageLoadError(false);
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
                  تحميل الصورة
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
