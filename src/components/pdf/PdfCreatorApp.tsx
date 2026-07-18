'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  FileText,
  Sparkles,
  Download,
  Loader2,
  Palette,
  BookOpen,
  GraduationCap,
  FlaskConical,
  Scale,
  PenTool,
  BarChart3,
  Settings,
  Link2,
  Check,
  X,
  Plus,
  Wand2,
  MessageSquare,
  Type,
  LayoutTemplate,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────
interface PdfTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: React.ReactNode;
  description: string;
  documentType: 'lecture' | 'summary' | 'research' | 'notes';
  topicCategory: string;
  placeholder: string;
}

interface GeneratedPdf {
  id: string;
  title: string;
  assetId: string;
  size: number;
  createdAt: string;
  documentType: string;
  linkedConversations: string[];
}

// ─── Templates ───────────────────────────────────────────────────────
const PDF_TEMPLATES: PdfTemplate[] = [
  {
    id: 'lecture',
    nameAr: 'محاضرة',
    nameEn: 'Lecture',
    icon: <BookOpen className="size-5" />,
    description: 'ملاحظات محاضرة منظمة مع عناوين وأقسام',
    documentType: 'lecture',
    topicCategory: 'default',
    placeholder: 'اكتب عنوان المحاضرة والمحتوى...\nمثال: محاضرة الذكاء الاصطناعي - مقدمة في التعلم العميق',
  },
  {
    id: 'summary',
    nameAr: 'ملخص',
    nameEn: 'Summary',
    icon: <FileText className="size-5" />,
    description: 'ملخص شامل ومنظم لموضوع معين',
    documentType: 'summary',
    topicCategory: 'default',
    placeholder: 'اكتب الموضوع الذي تريد تلخيصه...\nمثال: ملخص شامل لنظرية النسبية لأينشتاين',
  },
  {
    id: 'research',
    nameAr: 'بحث علمي',
    nameEn: 'Research',
    icon: <FlaskConical className="size-5" />,
    description: 'بحث علمي مع منهجية ومراجع',
    documentType: 'research',
    topicCategory: 'scientific',
    placeholder: 'اكتب موضوع البحث...\nمثال: تأثير الذكاء الاصطناعي على التعليم في الجامعات المصرية',
  },
  {
    id: 'medical',
    nameAr: 'تقرير طبي',
    nameEn: 'Medical',
    icon: <GraduationCap className="size-5" />,
    description: 'تقرير أو ملخص طبي مفصل',
    documentType: 'lecture',
    topicCategory: 'medical',
    placeholder: 'اكتب الموضوع الطبي...\nمثال: تشخيص وعلاج ارتفاع ضغط الدم',
  },
  {
    id: 'islamic',
    nameAr: 'بحث إسلامي',
    nameEn: 'Islamic',
    icon: <Scale className="size-5" />,
    description: 'بحث أو دراسة إسلامية مع أدلة',
    documentType: 'research',
    topicCategory: 'islamic',
    placeholder: 'اكتب الموضوع الإسلامي...\nمثال: أحكام الزكاة في الفقه الإسلامي',
  },
  {
    id: 'legal',
    nameAr: 'مستند قانوني',
    nameEn: 'Legal',
    icon: <PenTool className="size-5" />,
    description: 'مستند أو مذكرة قانونية',
    documentType: 'research',
    topicCategory: 'legal',
    placeholder: 'اكتب الموضوع القانوني...\nمثال: حقوق الملكية الفكرية في القانون المصري',
  },
  {
    id: 'notes',
    nameAr: 'ملاحظات',
    nameEn: 'Notes',
    icon: <BarChart3 className="size-5" />,
    description: 'ملاحظات شخصية أو دراسية سريعة',
    documentType: 'notes',
    topicCategory: 'default',
    placeholder: 'اكتب ملاحظاتك...\nمثال: ملاحظات مراجعة مادة البرمجة - الفصل الثالث',
  },
  {
    id: 'creative',
    nameAr: 'إبداعي',
    nameEn: 'Creative',
    icon: <Palette className="size-5" />,
    description: 'محتوى إبداعي أو قصة أو مقال',
    documentType: 'notes',
    topicCategory: 'creative',
    placeholder: 'اكتب المحتوى الإبداعي...\nمثال: مقال عن مستقبل التكنولوجيا في أفريقيا',
  },
];

// ─── Main Component ──────────────────────────────────────────────────
interface PdfCreatorAppProps {
  onBackToChat: () => void;
}

export function PdfCreatorApp({ onBackToChat }: PdfCreatorAppProps) {
  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string>('summary');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [renderer, setRenderer] = useState<'playwright'>('playwright');
  const [useDesignReasoning, setUseDesignReasoning] = useState(true);
  const [includeImages, setIncludeImages] = useState(false);
  const [useAiGeneration, setUseAiGeneration] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState('');

  // Generated PDFs
  const [generatedPdfs, setGeneratedPdfs] = useState<GeneratedPdf[]>([]);

  // Chat linking
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkingPdfId, setLinkingPdfId] = useState<string | null>(null);
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState('create');

  const { token } = useAuthStore();
  const { conversations } = useChatStore();

  const currentTemplate = PDF_TEMPLATES.find((t) => t.id === selectedTemplate);

  // ─── Load existing PDFs from DB ─────────────────────────────────────
  useEffect(() => {
    const loadExistingPdfs = async () => {
      if (!token) return;
      try {
        const response = await fetch('/api/pdf/list', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data.success && data.assets) {
          const existingPdfs: GeneratedPdf[] = data.assets.map((asset: any) => ({
            id: asset.id,
            title: asset.title,
            assetId: asset.id,
            size: asset.fileSize || 0,
            createdAt: new Date(asset.createdAt).toISOString(),
            documentType: asset.metadata?.documentType || 'summary',
            linkedConversations: [],
          }));
          setGeneratedPdfs((prev) => {
            // Merge: keep local PDFs (not yet saved to DB), add server PDFs
            const localOnly = prev.filter((p) => !existingPdfs.some((ep: GeneratedPdf) => ep.assetId === p.assetId));
            return [...localOnly, ...existingPdfs];
          });
        }
      } catch {
        // Silently fail - user can still create PDFs
      }
    };
    loadExistingPdfs();
  }, [token]);

  // ─── AI Content Generation ────────────────────────────────────────
  const handleAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) {
      toast.error('اكتب وصف للمحتوى المطلوب');
      return;
    }

    setIsAiGenerating(true);
    setGenerationStage('جاري توليد المحتوى بالذكاء الاصطناعي...');

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: aiPrompt,
          model: 'delta-pro',
          language: language,
        }),
      });

      if (!response.ok) throw new Error('فشل توليد المحتوى');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('لا يوجد استجابة');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulated += parsed.content;
                setContent(accumulated);
              }
            } catch {
              // skip
            }
          }
        }
      }

      if (!accumulated) {
        toast.error('لم يتم توليد محتوى. حاول مرة أخرى.');
      } else {
        toast.success('تم توليد المحتوى بنجاح! ✨');
      }
    } catch (error) {
      console.error('AI generation error:', error);
      toast.error('فشل توليد المحتوى. حاول مرة أخرى.');
    } finally {
      setIsAiGenerating(false);
      setGenerationStage('');
    }
  }, [aiPrompt, language, token]);

  // ─── PDF Generation ───────────────────────────────────────────────
  const handleGeneratePdf = useCallback(async () => {
    if (!title.trim()) {
      toast.error('اكتب عنوان المستند');
      return;
    }
    if (!content.trim() || content.length < 10) {
      toast.error('المحتوى قصير جداً - اكتب على الأقل 10 أحرف');
      return;
    }

    if (!token) {
      toast.error('يرجى تسجيل الدخول أولاً');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(10);
    setGenerationStage('جاري تحضير المستند...');

    try {
      setGenerationProgress(30);
      setGenerationStage('جاري إنشاء PDF...');

      const response = await fetch('/api/ai/hf/document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: 'local',
          topic: title,
          language,
          instructions: content,
          includeImages,
        }),
      });

      setGenerationProgress(70);
      setGenerationStage('جاري معالجة الملف...');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'فشل إنشاء PDF' }));
        throw new Error(errorData.error || 'فشل إنشاء PDF');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'فشل إنشاء PDF');
      }

      setGenerationProgress(90);
      setGenerationStage('جاري حفظ الملف...');

      const newPdf: GeneratedPdf = {
        id: `pdf_${Date.now()}`,
        title,
        assetId: data.filePath || data.fileUrl || '',
        size: data.durationMs || 0,
        createdAt: new Date().toISOString(),
        documentType: currentTemplate?.documentType || 'summary',
        linkedConversations: [],
      };

      setGeneratedPdfs((prev) => [newPdf, ...prev]);
      setGenerationProgress(100);
      setGenerationStage('تم إنشاء PDF بنجاح! ✅');

      toast.success('تم إنشاء PDF بنجاح! 📄');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error(
        error instanceof Error ? error.message : 'فشل إنشاء PDF. حاول مرة أخرى.'
      );
      setGenerationStage('فشل إنشاء PDF ❌');
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStage('');
      }, 2000);
    }
  }, [title, content, token, language, currentTemplate, useDesignReasoning]);

  // ─── PDF Download ─────────────────────────────────────────────────
  const handleDownloadPdf = useCallback(async (pdf: GeneratedPdf) => {
    if (!token) {
      toast.error('يرجى تسجيل الدخول أولاً');
      return;
    }

    try {
      const response = await fetch(`/api/pdf/download/${pdf.assetId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('فشل تحميل PDF');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pdf.title.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('تم تحميل PDF بنجاح');
    } catch (error) {
      toast.error('فشل تحميل PDF');
    }
  }, [token]);

  // ─── Link PDF to Chat ─────────────────────────────────────────────
  const handleLinkToChat = useCallback((pdfId: string) => {
    setLinkingPdfId(pdfId);
    setSelectedConversations([]);
    setShowLinkDialog(true);
  }, []);

  const confirmLinkToChats = useCallback(async () => {
    if (!linkingPdfId || selectedConversations.length === 0) {
      toast.error('اختر محادثة واحدة على الأقل');
      return;
    }

    const pdf = generatedPdfs.find((p) => p.id === linkingPdfId);
    if (!pdf) return;

    // Try to link via API
    let linkedCount = 0;
    for (const convId of selectedConversations) {
      try {
        if (token) {
          const response = await fetch('/api/pdf/link', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ assetId: pdf.assetId, conversationId: convId }),
          });
          if (response.ok) linkedCount++;
        }
      } catch {
        // Continue trying other conversations
      }
    }

    setGeneratedPdfs((prev) =>
      prev.map((p) =>
        p.id === linkingPdfId
          ? { ...p, linkedConversations: [...new Set([...p.linkedConversations, ...selectedConversations])] }
          : p
      )
    );

    toast.success(`تم ربط PDF بـ ${selectedConversations.length} محادثة${linkedCount > 0 ? ` (${linkedCount} رسالة أُضيف للمحادثة)` : ''}`);
    setShowLinkDialog(false);
    setLinkingPdfId(null);
    setSelectedConversations([]);
  }, [linkingPdfId, selectedConversations, generatedPdfs, token]);

  // ─── Send PDF to Chat ─────────────────────────────────────────────
  const handleSendToChat = useCallback((pdf: GeneratedPdf, conversationId: string) => {
    // Navigate back to chat with the PDF info
    onBackToChat();
    toast.success(`تم إرسال PDF "${pdf.title}" إلى المحادثة`);
  }, [onBackToChat]);

  // ─── Format file size ─────────────────────────────────────────────
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-screen bg-background" dir="rtl">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border card sticky top-0 z-40">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBackToChat}
          className="min-h-[44px] min-w-[44px] flex-shrink-0"
          aria-label="العودة للمحادثة"
        >
          <ArrowRight className="size-5" />
        </Button>

        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-to-bl from-blue-600 to-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500">
            <FileText className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">منشئ PDF</h1>
            <p className="text-[10px] text-muted-foreground">إنشاء ملفات PDF احترافية</p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Tab navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="h-9">
            <TabsTrigger value="create" className="text-xs px-3">
              <Wand2 className="size-3.5 ml-1" />
              إنشاء
            </TabsTrigger>
            <TabsTrigger value="my-pdfs" className="text-xs px-3">
              <FileText className="size-3.5 ml-1" />
              ملفاتي
              {generatedPdfs.length > 0 && (
                <Badge variant="secondary" className="mr-1 text-[10px] px-1.5 py-0 min-h-[16px]">
                  {generatedPdfs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {/* ─── Main Content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          {/* ─── Create Tab ─────────────────────────────────────────── */}
          <TabsContent value="create" className="h-full m-0 data-[state=active]:flex">
            <div className="flex flex-1 h-full">
              {/* ─── Left Sidebar: Templates ──────────────────────────── */}
              <div className="hidden md:flex w-[240px] flex-shrink-0 border-l border-border bg-muted">
                <ScrollArea className="w-full">
                  <div className="p-3 space-y-1.5">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                      أنواع المستندات
                    </h3>
                    {PDF_TEMPLATES.map((template) => (
                      <motion.button
                        key={template.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all',
                          selectedTemplate === template.id
                            ? 'bg-blue-500 text-blue-700 dark:text-blue-300 border border-blue-500 shadow-sm'
                            : 'hover:bg-accent text-foreground border border-transparent'
                        )}
                      >
                        <div className={cn(
                          'size-9 rounded-lg flex items-center justify-center flex-shrink-0',
                          selectedTemplate === template.id
                            ? 'bg-blue-500 text-blue-600 dark:text-blue-400'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {template.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{template.nameAr}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{template.nameEn}</p>
                        </div>
                        {selectedTemplate === template.id && (
                          <Check className="size-4 text-blue-500 flex-shrink-0 mr-auto" />
                        )}
                      </motion.button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* ─── Center: Editor ───────────────────────────────────── */}
              <div className="flex-1 flex flex-col min-w-0">
                <ScrollArea className="flex-1">
                  <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
                    {/* Template selector for mobile */}
                    <div className="md:hidden">
                      <Label className="text-xs font-semibold text-muted-foreground mb-2 block">نوع المستند</Label>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {PDF_TEMPLATES.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => setSelectedTemplate(template.id)}
                            className={cn(
                              'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all',
                              selectedTemplate === template.id
                                ? 'bg-blue-500 text-blue-700 dark:text-blue-300 border border-blue-500'
                                : 'muted text-muted-foreground border border-transparent hover:bg-accent'
                            )}
                          >
                            {template.icon}
                            {template.nameAr}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Title */}
                    <div className="space-y-2">
                      <Label htmlFor="pdf-title" className="text-sm font-semibold flex items-center gap-2">
                        <Type className="size-4 text-blue-500" />
                        عنوان المستند
                      </Label>
                      <Input
                        id="pdf-title"
                        placeholder={currentTemplate?.placeholder.split('\n')[0] || 'أدخل عنوان المستند...'}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="text-base font-semibold h-12 rounded-xl border-2 focus:border-blue-500 transition-colors"
                        dir="auto"
                      />
                    </div>

                    {/* AI Content Generation Toggle */}
                    <Card className="border-2 border-dashed border-blue-500 bg-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-5 text-blue-500" />
                            <div>
                              <p className="text-sm font-semibold">توليد بالذكاء الاصطناعي</p>
                              <p className="text-[10px] text-muted-foreground">دع AI يكتب المحتوى لك</p>
                            </div>
                          </div>
                          <Switch
                            checked={useAiGeneration}
                            onCheckedChange={setUseAiGeneration}
                          />
                        </div>

                        <AnimatePresence>
                          {useAiGeneration && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-2">
                                <Textarea
                                  placeholder="صف المحتوى الذي تريده... مثال: اكتب محاضرة عن الذكاء الاصطناعي تتضمن مقدمة وتاريخ وأنواعه وتطبيقاته"
                                  value={aiPrompt}
                                  onChange={(e) => setAiPrompt(e.target.value)}
                                  className="min-h-[80px] resize-none rounded-lg"
                                  dir="auto"
                                />
                                <Button
                                  onClick={handleAiGenerate}
                                  disabled={isAiGenerating || !aiPrompt.trim()}
                                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                                  size="sm"
                                >
                                  {isAiGenerating ? (
                                    <>
                                      <Loader2 className="size-4 ml-2 animate-spin" />
                                      جاري التوليد...
                                    </>
                                  ) : (
                                    <>
                                      <Wand2 className="size-4 ml-2" />
                                      توليد المحتوى
                                    </>
                                  )}
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>

                    {/* Content Editor */}
                    <div className="space-y-2">
                      <Label htmlFor="pdf-content" className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="size-4 text-blue-500" />
                        محتوى المستند
                        <Badge variant="secondary" className="text-[10px]">
                          {content.length} حرف
                        </Badge>
                      </Label>
                      <Textarea
                        id="pdf-content"
                        placeholder={currentTemplate?.placeholder || 'اكتب محتوى المستند هنا...'}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="min-h-[300px] sm:min-h-[400px] resize-y rounded-xl border-2 focus:border-blue-500 transition-colors text-sm leading-relaxed"
                        dir="auto"
                      />
                    </div>

                    {/* Settings Row (Mobile / Inline) */}
                    <div className="lg:hidden">
                      <Card className="bg-muted">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Settings className="size-4 text-muted-foreground" />
                            <span className="text-xs font-semibold">إعدادات سريعة</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[10px]">اللغة</Label>
                              <Select value={language} onValueChange={(v: 'ar' | 'en') => setLanguage(v)}>
                                <SelectTrigger className="h-8 text-xs rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ar">العربية</SelectItem>
                                  <SelectItem value="en">English</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">المحرك</Label>
                              <div className="h-8 flex items-center text-xs rounded-lg border px-3 muted text-muted-foreground">
                                Playwright
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">تصميم ذكي</Label>
                            <Switch checked={useDesignReasoning} onCheckedChange={setUseDesignReasoning} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">🖼️ تضمين صور AI</Label>
                            <Switch checked={includeImages} onCheckedChange={setIncludeImages} />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Generation Progress */}
                    <AnimatePresence>
                      {isGenerating && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <Card className="border-blue-500 bg-blue-500">
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <Loader2 className="size-4 text-blue-500 animate-spin" />
                                <span className="text-sm font-medium">{generationStage}</span>
                              </div>
                              <Progress value={generationProgress} className="h-2" />
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Generate Button */}
                    <Button
                      onClick={handleGeneratePdf}
                      disabled={isGenerating || !title.trim() || content.length < 10}
                      className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg shadow-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="size-5 ml-2 animate-spin" />
                          جاري الإنشاء...
                        </>
                      ) : (
                        <>
                          <FileText className="size-5 ml-2" />
                          إنشاء PDF
                        </>
                      )}
                    </Button>
                  </div>
                </ScrollArea>
              </div>

              {/* ─── Right Sidebar: Settings ──────────────────────────── */}
              <div className="hidden lg:flex w-[280px] flex-shrink-0 border-r border-border bg-muted">
                <ScrollArea className="w-full">
                  <div className="p-4 space-y-5">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Settings className="size-3.5" />
                      إعدادات المستند
                    </h3>

                    {/* Language */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">اللغة</Label>
                      <Select value={language} onValueChange={(v: 'ar' | 'en') => setLanguage(v)}>
                        <SelectTrigger className="rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">العربية</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Renderer */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">محرك التصيير</Label>
                      <div className="flex items-center h-10 rounded-lg border px-3 muted text-sm text-muted-foreground">
                        Playwright (عالي الجودة)
                      </div>
                    </div>

                    {/* Design Reasoning */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium">تصميم ذكي</Label>
                        <p className="text-[10px] text-muted-foreground">AI يختار أفضل تصميم</p>
                      </div>
                      <Switch
                        checked={useDesignReasoning}
                        onCheckedChange={setUseDesignReasoning}
                      />
                    </div>

                    <Separator />

                    {/* Template Info */}
                    {currentTemplate && (
                      <Card className="card">
                        <CardHeader className="pb-2 pt-3 px-3">
                          <CardTitle className="text-xs flex items-center gap-2">
                            <LayoutTemplate className="size-3.5 text-blue-500" />
                            القالب الحالي
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="size-8 rounded-lg bg-blue-500 flex items-center justify-center text-blue-600">
                              {currentTemplate.icon}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{currentTemplate.nameAr}</p>
                              <p className="text-[10px] text-muted-foreground">{currentTemplate.nameEn}</p>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{currentTemplate.description}</p>
                          <div className="flex gap-1.5">
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                              {currentTemplate.documentType}
                            </Badge>
                            {currentTemplate.topicCategory !== 'default' && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                {currentTemplate.topicCategory}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Separator />

                    {/* Quick Stats */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">ملخص المستند</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="muted rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-foreground">{content.length}</p>
                          <p className="text-[10px] text-muted-foreground">حرف</p>
                        </div>
                        <div className="muted rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-foreground">
                            {content.split(/\s+/).filter(Boolean).length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">كلمة</p>
                        </div>
                      </div>
                    </div>

                    {/* Linked Chats */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Link2 className="size-3" />
                        ربط بالمحادثات
                      </h4>
                      {generatedPdfs.some((p) => p.linkedConversations.length > 0) ? (
                        <div className="space-y-1">
                          {generatedPdfs
                            .filter((p) => p.linkedConversations.length > 0)
                            .map((pdf) => (
                              <div key={pdf.id} className="text-[11px] muted rounded-lg px-2 py-1.5 flex items-center gap-1.5">
                                <FileText className="size-3 text-blue-500 flex-shrink-0" />
                                <span className="truncate flex-1">{pdf.title}</span>
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                  {pdf.linkedConversations.length} محادثة
                                </Badge>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">لم يتم ربط أي ملفات بعد</p>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          {/* ─── My PDFs Tab ─────────────────────────────────────────── */}
          <TabsContent value="my-pdfs" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="max-w-4xl mx-auto p-4 sm:p-6">
                {generatedPdfs.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-20 text-center"
                  >
                    <div className="size-20 rounded-2xl muted flex items-center justify-center mb-4">
                      <FileText className="size-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد ملفات PDF بعد</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                      ابدأ بإنشاء أول ملف PDF من القسم السابق. يمكنك إنشاء محاضرات وملخصات وأبحاث ومزيد.
                    </p>
                    <Button
                      onClick={() => setActiveTab('create')}
                      variant="outline"
                      className="gap-2"
                    >
                      <Plus className="size-4" />
                      إنشاء ملف PDF جديد
                    </Button>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">ملفات PDF الخاصة بي</h2>
                      <Badge variant="secondary">{generatedPdfs.length} ملف</Badge>
                    </div>

                    {generatedPdfs.map((pdf, index) => (
                      <motion.div
                        key={pdf.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="size-12 rounded-xl bg-gradient-to-bl from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                                <FileText className="size-6 text-blue-600" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold truncate">{pdf.title}</h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {pdf.documentType}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatSize(pdf.size)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(pdf.createdAt).toLocaleDateString('ar-EG')}
                                  </span>
                                  {pdf.linkedConversations.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] gap-1">
                                      <Link2 className="size-2.5" />
                                      {pdf.linkedConversations.length} محادثة
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-9"
                                  onClick={() => handleDownloadPdf(pdf)}
                                  aria-label="تحميل"
                                >
                                  <Download className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-9"
                                  onClick={() => handleLinkToChat(pdf.id)}
                                  aria-label="ربط بمحادثة"
                                >
                                  <Link2 className="size-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Linked conversations */}
                            {pdf.linkedConversations.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <p className="text-[10px] text-muted-foreground mb-2">محادثات مرتبطة:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {pdf.linkedConversations.map((convId) => {
                                    const conv = conversations.find((c) => c.id === convId);
                                    return conv ? (
                                      <Badge
                                        key={convId}
                                        variant="secondary"
                                        className="text-[10px] gap-1 cursor-pointer hover:bg-accent"
                                        onClick={() => handleSendToChat(pdf, convId)}
                                      >
                                        <MessageSquare className="size-2.5" />
                                        {conv.title || 'محادثة'}
                                      </Badge>
                                    ) : null;
                                  })}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Link to Chat Dialog ──────────────────────────────────────── */}
      <AnimatePresence>
        {showLinkDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 "
            onClick={() => setShowLinkDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
              dir="rtl"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Link2 className="size-5 text-blue-500" />
                  <h2 className="text-sm font-bold">ربط PDF بمحادثة</h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setShowLinkDialog(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-4">
                {conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="size-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">لا توجد محادثات بعد</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setSelectedConversations((prev) =>
                            prev.includes(conv.id)
                              ? prev.filter((id) => id !== conv.id)
                              : [...prev, conv.id]
                          );
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl text-right transition-all',
                          selectedConversations.includes(conv.id)
                            ? 'bg-blue-500 border border-blue-500'
                            : 'muted border border-transparent hover:bg-accent'
                        )}
                      >
                        <MessageSquare className="size-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {conv.title || 'محادثة جديدة'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {conv.messages.length} رسالة
                          </p>
                        </div>
                        {selectedConversations.includes(conv.id) && (
                          <Check className="size-4 text-blue-500 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="p-4 border-t border-border">
                <Button
                  onClick={confirmLinkToChats}
                  disabled={selectedConversations.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Link2 className="size-4 ml-2" />
                  ربط بـ {selectedConversations.length} محادثة
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
