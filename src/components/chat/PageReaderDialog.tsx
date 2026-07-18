'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Globe, Copy, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';

interface PageReaderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsertContent?: (content: string) => void;
}

export function PageReaderDialog({ open, onOpenChange, onInsertContent }: PageReaderDialogProps) {
  const [url, setUrl] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [result, setResult] = useState<{ title: string; content: string; url: string } | null>(null);

  const token = useAuthStore((s) => s.token);

  const handleRead = async () => {
    if (!url.trim()) {
      toast.error('أدخل رابط الصفحة');
      return;
    }

    setIsReading(true);
    setResult(null);

    try {
      const response = await fetch('/api/ai/page-reader', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
      });

      // Handle non-JSON responses
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

      setResult({
        title: data.title || '',
        content: data.content || '',
        url: data.url || url,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل في قراءة الصفحة');
    } finally {
      setIsReading(false);
    }
  };

  const copyContent = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content);
      toast.success('تم النسخ');
    }
  };

  const insertContent = () => {
    if (result?.content && onInsertContent) {
      onInsertContent(result.content);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setUrl('');
      setResult(null);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-5 text-blue-500" />
            قارئ صفحات الويب
          </DialogTitle>
          <DialogDescription>
            أدخل رابط صفحة ويب لاستخراج محتواها
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* URL Input */}
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              onKeyDown={(e) => e.key === 'Enter' && handleRead()}
              className="flex-1"
              dir="ltr"
              disabled={isReading}
            />
            <Button onClick={handleRead} disabled={isReading}>
              {isReading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Globe className="size-4" />
              )}
            </Button>
          </div>

          {/* Result */}
          {result && (
            <div className="border dark:border-gray-700 border-gray-200 rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto">
              <div>
                <h4 className="font-semibold text-sm">{result.title || 'بدون عنوان'}</h4>
                <p className="text-xs text-gray-400">{result.url}</p>
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {result.content.slice(0, 5000)}
                {result.content.length > 5000 && '...'}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyContent}>
                  <Copy className="size-3 ml-1" />
                  نسخ
                </Button>
                {onInsertContent && (
                  <Button variant="outline" size="sm" onClick={insertContent}>
                    <FileText className="size-3 ml-1" />
                    إدراج في المحادثة
                  </Button>
                )}
              </div>
            </div>
          )}

          {!result && !isReading && (
            <div className="text-center py-8 text-gray-400">
              <Globe className="size-12 mx-auto mb-2 opacity-50" />
              <p>أدخل رابط صفحة ويب لاستخراج محتواها</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
