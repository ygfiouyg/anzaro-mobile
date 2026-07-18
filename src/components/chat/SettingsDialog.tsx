'use client';

import { useState } from 'react';
import { Settings, Globe, Palette, Monitor, MessageSquare, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import { useTheme } from 'next-themes';
import { getModelById, models } from '@/lib/models';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { language, setLanguage } = useAuthStore();
  const { activeModel, setActiveModel, activeLanguage, setActiveLanguage } = useChatStore();
  const { theme, setTheme } = useTheme();
  const [streaming, setStreaming] = useState(true);

  const currentModel = getModelById(activeModel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5 text-blue-500" />
            الإعدادات
          </DialogTitle>
          <DialogDescription>
            تخصيص إعدادات المنصة حسب تفضيلاتك
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-2" dir="rtl">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="general" className="text-xs">
              <Globe className="size-3.5 ml-1" />
              عام
            </TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs">
              <Palette className="size-3.5 ml-1" />
              المظهر
            </TabsTrigger>
            <TabsTrigger value="chat" className="text-xs">
              <MessageSquare className="size-3.5 ml-1" />
              المحادثة
            </TabsTrigger>
            <TabsTrigger value="about" className="text-xs">
              <Info className="size-3.5 ml-1" />
              حول
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>اللغة المفضلة</Label>
              <Select value={language} onValueChange={(val) => setLanguage(val as 'ar' | 'en' | 'egyptian')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="egyptian">المصرية 🇪🇬</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>لغة المحادثة</Label>
              <Select value={activeLanguage} onValueChange={(val) => setActiveLanguage(val as 'ar' | 'en' | 'egyptian')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="egyptian">المصرية 🇪🇬</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* Appearance Settings */}
          <TabsContent value="appearance" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Monitor className="size-4" />
                السمة
              </Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">فاتح ☀️</SelectItem>
                  <SelectItem value="dark">داكن 🌙</SelectItem>
                  <SelectItem value="system">تلقائي 💻</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* Chat Settings */}
          <TabsContent value="chat" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>النموذج الافتراضي</Label>
              <Select value={activeModel} onValueChange={setActiveModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.slice(0, 12).map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentModel && (
                <p className="text-[10px] text-muted-foreground">
                  {currentModel.description}
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label>البث المباشر</Label>
                <p className="text-[10px] text-muted-foreground">عرض الردود في الوقت الفعلي</p>
              </div>
              <Switch
                checked={streaming}
                onCheckedChange={setStreaming}
              />
            </div>
          </TabsContent>

          {/* About */}
          <TabsContent value="about" className="mt-4">
            <div className="text-center space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-bl from-blue-600 to-blue-500 shadow-lg shadow-blue-500">
                  <span className="text-2xl">🌊</span>
                </div>
                <h3 className="text-lg font-bold">Anzaro AI</h3>
                <p className="text-xs text-muted-foreground">بعقل هادي، هنوصل 🌊</p>
              </div>

              <Separator />

              <div className="space-y-2 text-xs text-muted-foreground">
                <p>الإصدار: 3.0.0</p>
                <p>36+ نموذج ذكاء اصطناعي</p>
                <p>3 لغات مدعومة</p>
                <p>محرك PDF ULTRA v3.0</p>
              </div>

              <Separator />

              <p className="text-[10px] text-muted-foreground">
                منصة الذكاء الاصطناعي الأولى بالعربية والمصري 🇪🇬
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
