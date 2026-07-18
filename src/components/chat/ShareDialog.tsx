'use client';

import { useState, useCallback } from 'react';
import { Share2, Copy, FileText, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useChatStore } from '@/store/chat-store';
import { toast } from 'sonner';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const { conversations, activeConversationId } = useChatStore();
  const [copied, setCopied] = useState<string | null>(null);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  const getConversationText = useCallback(() => {
    if (!activeConversation) return '';
    const lines = activeConversation.messages.map((msg) => {
      const role = msg.role === 'user' ? '👤' : '🤖';
      return `${role} ${msg.content}`;
    });
    return lines.join('\n\n');
  }, [activeConversation]);

  const getConversationMarkdown = useCallback(() => {
    if (!activeConversation) return '';
    const title = activeConversation.title || 'محادثة Anzaro AI';
    const lines = activeConversation.messages.map((msg) => {
      const role = msg.role === 'user' ? '**👤 المستخدم**' : '**🤖 المساعد**';
      return `${role}\n\n${msg.content}`;
    });
    return `# ${title}\n\n---\n\n${lines.join('\n\n---\n\n')}\n\n---\n\n*تم المشاركة من Anzaro AI — بعقل هادي، هنوصل 🌊*`;
  }, [activeConversation]);

  const handleCopyText = useCallback(async () => {
    const text = getConversationText();
    if (!text) {
      toast.error('لا توجد محادثة للمشاركة');
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied('text');
    toast.success('تم نسخ النص!');
    setTimeout(() => setCopied(null), 2000);
  }, [getConversationText]);

  const handleCopyMarkdown = useCallback(async () => {
    const md = getConversationMarkdown();
    if (!md) {
      toast.error('لا توجد محادثة للمشاركة');
      return;
    }
    await navigator.clipboard.writeText(md);
    setCopied('markdown');
    toast.success('تم نسخ Markdown!');
    setTimeout(() => setCopied(null), 2000);
  }, [getConversationMarkdown]);

  const handleExportTxt = useCallback(() => {
    const text = getConversationMarkdown();
    if (!text) {
      toast.error('لا توجد محادثة للتصدير');
      return;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deltaai-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير المحادثة!');
  }, [getConversationMarkdown]);

  const hasMessages = activeConversation && activeConversation.messages.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5 text-blue-500" />
            مشاركة المحادثة
          </DialogTitle>
          <DialogDescription>
            {hasMessages
              ? `مشاركة محادثة "${activeConversation?.title || 'بدون عنوان'}"`
              : 'لا توجد محادثة نشطة للمشاركة'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {!hasMessages ? (
            <div className="text-center py-6 text-muted-foreground">
              <Share2 className="size-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">ابدأ محادثة أولاً للمشاركة</p>
            </div>
          ) : (
            <>
              {/* Copy as Text */}
              <Button
                variant="outline"
                className="w-full justify-start h-14"
                onClick={handleCopyText}
              >
                <div className="flex items-center gap-3">
                  {copied === 'text' ? (
                    <Check className="size-5 text-blue-500" />
                  ) : (
                    <Copy className="size-5 text-muted-foreground" />
                  )}
                  <div className="text-right">
                    <p className="text-sm font-medium">نسخ كنص عادي</p>
                    <p className="text-[10px] text-muted-foreground">نسخ محتوى المحادثة كنص بسيط</p>
                  </div>
                </div>
              </Button>

              {/* Copy as Markdown */}
              <Button
                variant="outline"
                className="w-full justify-start h-14"
                onClick={handleCopyMarkdown}
              >
                <div className="flex items-center gap-3">
                  {copied === 'markdown' ? (
                    <Check className="size-5 text-blue-500" />
                  ) : (
                    <Copy className="size-5 text-muted-foreground" />
                  )}
                  <div className="text-right">
                    <p className="text-sm font-medium">نسخ كـ Markdown</p>
                    <p className="text-[10px] text-muted-foreground">نسخ بتنسيق Markdown مع العناوين</p>
                  </div>
                </div>
              </Button>

              <Separator />

              {/* Export as .txt */}
              <Button
                variant="outline"
                className="w-full justify-start h-14"
                onClick={handleExportTxt}
              >
                <div className="flex items-center gap-3">
                  <FileText className="size-5 text-muted-foreground" />
                  <div className="text-right">
                    <p className="text-sm font-medium">تصدير كملف .txt</p>
                    <p className="text-[10px] text-muted-foreground">تحميل المحادثة كملف نصي</p>
                  </div>
                </div>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
