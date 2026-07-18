'use client';

import { useState } from 'react';
import { Languages, Copy, Loader2, ArrowRightLeft } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface TranslationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGES = [
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'ur', label: 'اردو' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'ru', label: 'Русский' },
  { value: 'egyptian', label: 'المصرية 🇪🇬' },
];

export function TranslationDialog({ open, onOpenChange }: TranslationDialogProps) {
  const [fromLang, setFromLang] = useState('ar');
  const [toLang, setToLang] = useState('en');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      toast.error('يرجى إدخال نص للترجمة');
      return;
    }

    setIsTranslating(true);
    setTranslatedText('');

    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText.trim(),
          from: fromLang,
          to: toLang,
        }),
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

      setTranslatedText(data.translatedText);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء الترجمة');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    toast.success('تم النسخ!');
  };

  const swapLanguages = () => {
    const temp = fromLang;
    setFromLang(toLang);
    setToLang(temp);
    if (translatedText) {
      setInputText(translatedText);
      setTranslatedText('');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setInputText('');
      setTranslatedText('');
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="size-5 text-blue-500" />
            ترجمة النصوص
          </DialogTitle>
          <DialogDescription>
            ترجم النصوص بين اللغات المختلفة باستخدام الذكاء الاصطناعي
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Language Selectors */}
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">من</Label>
              <Select value={fromLang} onValueChange={setFromLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="mt-5 size-9"
              onClick={swapLanguages}
              aria-label="تبديل اللغات"
            >
              <ArrowRightLeft className="size-4" />
            </Button>

            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">إلى</Label>
              <Select value={toLang} onValueChange={setToLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Input Text */}
          <div className="space-y-1.5">
            <Label>النص المراد ترجمته</Label>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="أدخل النص هنا..."
              rows={4}
              dir="auto"
            />
          </div>

          {/* Translate Button */}
          <Button
            onClick={handleTranslate}
            disabled={isTranslating || !inputText.trim()}
            className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white dark:text-black"
          >
            {isTranslating ? (
              <>
                <Loader2 className="size-4 ml-2 animate-spin" />
                جاري الترجمة...
              </>
            ) : (
              <>
                <Languages className="size-4 ml-2" />
                ترجمة
              </>
            )}
          </Button>

          {/* Translated Output */}
          {translatedText && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>الترجمة</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCopy}>
                  <Copy className="size-3 ml-1" />
                  نسخ
                </Button>
              </div>
              <div className="p-3 rounded-lg bg-muted border border-border">
                <p className="text-sm leading-relaxed" dir="auto">{translatedText}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
