'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, XCircle, FileText, CheckCircle, XCircle as XIcon, Music } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChatHeader } from './ChatHeader';
import { ConversationSidebar } from './ConversationSidebar';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { StatusBar } from './StatusBar';
import { IslamicPanel } from './IslamicPanel';
import { BackendTracePanel } from './BackendTracePanel';
import { VoiceBroadcast } from './VoiceBroadcast';
import { FilesPanel } from './FilesPanel';
import { SkillsPanel } from './SkillsPanel';
import { ToolsGallery } from './ToolsGallery';
import { MusicPlayer } from './MusicPlayer';
import { QuizGenerator } from './QuizGenerator';
import { ImageGenDialog } from './ImageGenDialog';
import { VideoGenDialog } from './VideoGenDialog';
import { ImageSearchDialog } from './ImageSearchDialog';
import { SmartBallOverlay } from '@/components/anzaro/SmartBallOverlay';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

interface ChatAppProps {
  onSwitchToPdfCreator?: () => void;
}

export function ChatApp({ onSwitchToPdfCreator }: ChatAppProps = {}) {
  const { sidebarOpen, setSidebarOpen, sendMessage, setActiveModel, activeModel, quizAutoData, quizGenStatus, quizOpen: storeQuizOpen, quizTopic, setQuizOpen, setQuizAutoData, setQuizGenStatus, setQuizTopic } = useChatStore();
  const isMobile = useIsMobile();
  const [islamicPanelOpen, setIslamicPanelOpen] = useState(false);
  const [tracePanelOpen, setTracePanelOpen] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [skillsPanelOpen, setSkillsPanelOpen] = useState(false);
  const [toolsGalleryOpen, setToolsGalleryOpen] = useState(false);
  const [musicPlayerOpen, setMusicPlayerOpen] = useState(false);
  const [broadcastDismissed, setBroadcastDismissed] = useState(false);

  // ── Dialog state for slash commands ──
  const [imageGenOpen, setImageGenOpen] = useState(false);
  const [videoGenOpen, setVideoGenOpen] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  // ── Listen for slash-command events from ChatInput ──
  // /صورة → open ImageGenDialog
  useEffect(() => {
    const handler = () => setImageGenOpen(true);
    window.addEventListener('delta-ai-image-gen', handler);
    return () => window.removeEventListener('delta-ai-image-gen', handler);
  }, []);

  // ── Smart Ball quick-action bridge ──
  // When the Smart Ball overlay dispatches a quick-command, forward it to the real chat.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (detail && typeof detail === 'string' && detail.trim()) {
        try {
          sendMessage(detail.trim());
        } catch {
          // store may not be ready
        }
      }
    };
    window.addEventListener('anzaro-quick-send', handler);
    return () => window.removeEventListener('anzaro-quick-send', handler);
  }, [sendMessage]);

  // /فيديو → open VideoGenDialog
  useEffect(() => {
    const handler = () => setVideoGenOpen(true);
    window.addEventListener('delta-ai-video-gen', handler);
    return () => window.removeEventListener('delta-ai-video-gen', handler);
  }, []);

  // /بحث → open ImageSearchDialog (web image search)
  useEffect(() => {
    const handler = () => setImageSearchOpen(true);
    window.addEventListener('delta-ai-search', handler);
    return () => window.removeEventListener('delta-ai-search', handler);
  }, []);

  // /كود /مصري /شاعر /طبيب /قانون → switch model
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.model) {
        // setActiveModel is available via the store hook at top of component
        try {
          const { setActiveModel } = useChatStore.getState();
          setActiveModel(detail.model);
        } catch {
          // ignore — store may not be ready
        }
      }
    };
    window.addEventListener('delta-ai-switch-model', handler);
    return () => window.removeEventListener('delta-ai-switch-model', handler);
  }, []);

  // ── /استخراج: extract all laws from files → compile into PDF ──
  // This is the document-memory flow: upload files → generate PDF → show in chat
  const [extractStatus, setExtractStatus] = useState<'idle' | 'uploading' | 'generating' | 'done' | 'error'>('idle');
  const [extractMessage, setExtractMessage] = useState('');
  const [extractPdfUrl, setExtractPdfUrl] = useState<string | null>(null);
  const [extractMemoryId, setExtractMemoryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingExtractRequest = useRef<string>('');

  const handleExtractFiles = useCallback(async (files: File[], request: string) => {
    const token = useChatStore.getState().token;
    if (!token) {
      setExtractStatus('error');
      setExtractMessage('يجب تسجيل الدخول أولاً');
      return;
    }

    setExtractStatus('uploading');
    setExtractMessage('📂 جاري قراءة الملفات واستخراج المحتوى...');
    setExtractPdfUrl(null);

    try {
      // Step 1: Extract text from each file and upload to document-memory
      const fileData: Array<{ name: string; text?: string; content?: string; type: string }> = [];
      for (const file of files) {
        if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
          // PDF: convert to base64, send to server for extraction
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          fileData.push({ name: file.name, content: `data:application/pdf;base64,${base64}`, type: file.type });
        } else if (file.type.startsWith('text/')) {
          const text = await file.text();
          fileData.push({ name: file.name, text, type: file.type });
        } else {
          // Try as text
          const text = await file.text();
          fileData.push({ name: file.name, text, type: file.type });
        }
      }

      const uploadRes = await fetch('/api/ai/document-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'upload', userRequest: request, files: fileData, language: 'ar' }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

      setExtractMemoryId(uploadData.memoryId);
      setExtractStatus('generating');
      setExtractMessage(`🎨 تم حفظ ${uploadData.fileCount} ملف. جاري التحليل والتوليد...`);

      // Step 2: Generate PDF from memory
      const genRes = await fetch('/api/ai/document-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'generate', memoryId: uploadData.memoryId }),
      });
      const genData = await genRes.json();
      if (!genData.success) throw new Error(genData.error || 'Generation failed');

      setExtractPdfUrl(genData.fileUrl);
      setExtractStatus('done');
      setExtractMessage('✅ تم إنشاء الملف! المحتوى محفوظ في الذاكرة — قيم النتيجة');

      // Add a message to the chat with the PDF link
      const { activeConversationId, addMessage } = useChatStore.getState();
      if (activeConversationId) {
        addMessage(activeConversationId, {
          id: `extract-${Date.now()}`,
          role: 'assistant',
          content: `## ✅ تم استخراج القوانين وإنشاء الملف\n\n📄 **الملف:** ${genData.fileName}\n📊 **حجم الملف:** ${(genData.fileSize / 1024).toFixed(0)} KB\n⏱️ **الوقت:** ${(genData.durationMs / 1000).toFixed(0)} ثانية\n\n👉 [اضغط هنا لفتح المستند](${genData.fileUrl})\n\n---\n💡 المحتوى محفوظ في الذاكرة. هل النتيجة مناسبة؟`,
          model: 'document-memory',
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      setExtractStatus('error');
      setExtractMessage(e instanceof Error ? e.message : 'حدث خطأ');
    }
  }, []);

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const request = detail?.request?.trim();

      // If the user didn't type a request, ask them what they want.
      // No hardcoded default — the model should execute the USER's actual request.
      if (!request) {
        setExtractStatus('error');
        setExtractMessage('اكتب طلبك بعد /استخراج — مثلاً: /استخراج لخّص كل القوانين، أو /استخراج استخرج كل المعادلات، أو أي طلب تاني');
        return;
      }
      pendingExtractRequest.current = request;

      // Trigger the file picker
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.click();
        const onChange = async (ev: Event) => {
          const target = ev.target as HTMLInputElement;
          if (target.files && target.files.length > 0) {
            await handleExtractFiles(Array.from(target.files), pendingExtractRequest.current);
          }
          target.removeEventListener('change', onChange);
        };
        fileInput.addEventListener('change', onChange);
      } else {
        setExtractStatus('error');
        setExtractMessage('لا يمكن العثور على حقل رفع الملفات');
      }
    };
    window.addEventListener('delta-ai-extract-files', handler);
    return () => window.removeEventListener('delta-ai-extract-files', handler);
  }, [handleExtractFiles]);

  // Close sidebar on mobile by default (but don't force-close on desktop)
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isMobile, sidebarOpen, setSidebarOpen]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, [setSidebarOpen]);

  const handleToggleIslamicPanel = () => {
    setIslamicPanelOpen(!islamicPanelOpen);
  };

  const handleToggleTracePanel = () => {
    setTracePanelOpen(!tracePanelOpen);
  };

  const handleToggleFilesPanel = () => {
    setFilesPanelOpen(!filesPanelOpen);
  };

  const handleToggleSkillsPanel = () => {
    setSkillsPanelOpen(!skillsPanelOpen);
  };

  const handleToggleToolsGallery = () => {
    setToolsGalleryOpen(!toolsGalleryOpen);
  };

  const handleIslamicPrompt = useCallback((prompt: string) => {
    setActiveModel('delta-islamic');
    sendMessage(prompt);
  }, [setActiveModel, sendMessage]);

  // Listen for quiz open event from ChatInput slash commands
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const topic = detail?.topic || '';
      const autoGenerate = detail?.autoGenerate || false;
      setQuizTopic(topic);
      setQuizOpen(true);

      // If autoGenerate flag is set and topic is provided, generate quiz via API
      if (autoGenerate && topic.trim()) {
        // Show generating status
        setQuizGenStatus('generating');

        (async () => {
          try {
            // Build conversation context from recent messages
            const state = useChatStore.getState();
            const conv = state.conversations.find((c) => c.id === state.activeConversationId);
            const recentMessages = conv?.messages || [];
            const convContext = recentMessages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .slice(-10)
              .map((m) => {
                const label = m.role === 'user' ? '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645' : '\u0627\u0644\u0645\u0633\u0627\u0639\u062f';
                const content = m.content.length > 1500 ? m.content.slice(0, 1500) + '...' : m.content;
                return `${label}: ${content}`;
              })
              .join('\n\n');

            const response = await fetch('/api/ai/quiz', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic: topic.trim(),
                conversationContext: convContext || undefined,
                questionCount: 10,
                difficulty: 'medium',
                types: ['mcq', 'true-false'],
              }),
            });

            if (response.ok) {
              const quizData = await response.json();
              useChatStore.getState().setQuizAutoData({
                ...quizData,
                source: 'chat',
              });
            } else {
              useChatStore.getState().setQuizGenStatus('failed');
            }
          } catch (err) {
            console.error('[Quiz] Auto-generation from slash command failed:', err);
            useChatStore.getState().setQuizGenStatus('failed');
          }
        })();
      }
    };
    window.addEventListener('delta-ai-quiz', handler);
    return () => window.removeEventListener('delta-ai-quiz', handler);
  }, [setQuizOpen, setQuizTopic, setQuizGenStatus]);

  // Auto-open quiz dialog when quizAutoData is set from chat stream
  // and clear the generating status indicator
  useEffect(() => {
    if (quizAutoData) {
      // Always open the quiz dialog when new quiz data arrives from chat
      if (!storeQuizOpen) {
        setQuizOpen(true);
      }
      // Clear the generating status after quiz opens
      setTimeout(() => setQuizGenStatus(null), 500);
    }
  }, [quizAutoData, storeQuizOpen, setQuizOpen, setQuizGenStatus]);

  // Safety timeout: auto-clear quiz "generating" indicator after 60 seconds
  // Prevents the indicator from showing forever if both stream and client-side generation fail
  useEffect(() => {
    if (quizGenStatus === 'generating') {
      const timer = setTimeout(() => {
        const state = useChatStore.getState();
        if (state.quizGenStatus === 'generating' && !state.quizAutoData) {
          console.warn('[Quiz] Safety timeout: clearing stuck generating indicator');
          useChatStore.getState().setQuizGenStatus('failed');
        }
      }, 60_000);
      return () => clearTimeout(timer);
    }
  }, [quizGenStatus]);

  return (
    <div className="flex h-screen overflow-hidden relative bg-background" dir="rtl">
      {/* iOS-style flat background — no aurora orbs, clean and minimal */}

      {/* Desktop Conversation Sidebar */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-shrink-0 border-l border-border overflow-hidden relative z-10 bg-card"
            >
              <div className="w-[320px] h-full">
                <ConversationSidebar onToggleFilesPanel={handleToggleFilesPanel} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Conversation Sidebar — works on BOTH mobile and desktop */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="right" className="p-0 w-[300px] max-w-[85vw] card border-border" dir="rtl">
          <SheetHeader className="sr-only">
            <SheetTitle>المحادثات</SheetTitle>
            <SheetDescription>قائمة المحادثات</SheetDescription>
          </SheetHeader>
          <ConversationSidebar onToggleFilesPanel={handleToggleFilesPanel} />
        </SheetContent>
      </Sheet>

      {/* Desktop Files Panel (Left side in RTL) */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {filesPanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-shrink-0 border-r border-border overflow-hidden relative z-10 bg-card"
            >
              <div className="w-[300px] h-full">
                <FilesPanel onClose={() => setFilesPanelOpen(false)} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Mobile Files Panel - Sheet */}
      {isMobile && (
        <Sheet open={filesPanelOpen} onOpenChange={setFilesPanelOpen}>
          <SheetContent side="left" className="p-0 w-[300px] card border-border" dir="rtl">
            <SheetHeader className="sr-only">
              <SheetTitle>ملفاتي</SheetTitle>
              <SheetDescription>الملفات المُنشأة</SheetDescription>
            </SheetHeader>
            <FilesPanel onClose={() => setFilesPanelOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10 bg-background">
        {/* Voice Broadcast Bar */}
        <VoiceBroadcast />

        {/* Header */}
        <ChatHeader
          onToggleSidebar={handleToggleSidebar}
          onToggleFilesPanel={handleToggleFilesPanel}
          onToggleSkillsPanel={handleToggleSkillsPanel}
          skillsPanelOpen={skillsPanelOpen}
          onToggleToolsGallery={handleToggleToolsGallery}
          toolsGalleryOpen={toolsGalleryOpen}
          onSwitchToPdfCreator={onSwitchToPdfCreator}
        />

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <MessageList />
        </div>

        {/* Input Area */}
        <ChatInput />

        {/* Status Bar */}
        <StatusBar />
      </div>

      {/* Quiz Generator Dialog */}
      <QuizGenerator
        open={storeQuizOpen}
        onOpenChange={(isOpen) => {
          setQuizOpen(isOpen);
          // Clear auto-quiz data and topic immediately when dialog closes to prevent re-triggering
          if (!isOpen) {
            setQuizAutoData(null);
            setQuizTopic('');
          }
        }}
        autoQuizData={quizAutoData}
        initialTopic={quizTopic}
      />

      {/* Image Generation Dialog (triggered by /صورة) */}
      <ImageGenDialog open={imageGenOpen} onOpenChange={setImageGenOpen} />

      {/* Video Generation Dialog (triggered by /فيديو) */}
      <VideoGenDialog open={videoGenOpen} onOpenChange={setVideoGenOpen} />

      {/* Image Search Dialog (triggered by /بحث) */}
      <ImageSearchDialog open={imageSearchOpen} onOpenChange={setImageSearchOpen} />

      {/* Extract Files Indicator (triggered by /استخراج) */}
      {extractStatus !== 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 px-6 py-4 rounded-2xl shadow-xl bg-card border border-border max-w-md"
          dir="rtl"
        >
          <div className="flex items-center gap-3">
            {extractStatus === 'uploading' || extractStatus === 'generating' ? (
              <Loader2 className="size-5 animate-spin text-blue-500" />
            ) : extractStatus === 'done' ? (
              <CheckCircle className="size-5 text-blue-500" />
            ) : (
              <XIcon className="size-5 text-red-500" />
            )}
            <span className="text-sm font-medium">{extractMessage}</span>
          </div>

          {extractStatus === 'generating' && (
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-500"
                animate={{ width: ['0%', '70%', '90%'] }}
                transition={{ duration: 120, repeat: Infinity }}
              />
            </div>
          )}

          {extractStatus === 'done' && extractPdfUrl && (
            <div className="flex flex-col gap-2 w-full">
              <a
                href={extractPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-500 text-white text-sm font-medium hover:opacity-90"
              >
                <FileText className="size-4" />
                فتح المستند
              </a>
              {extractMemoryId && (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const token = useChatStore.getState().token;
                      await fetch('/api/ai/document-memory', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ action: 'feedback', memoryId: extractMemoryId, satisfied: true }),
                      });
                      setExtractStatus('idle');
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-blue-500 text-blue-600 text-xs font-medium hover:bg-blue-500"
                  >
                    ✓ النتيجة مناسبة
                  </button>
                  <button
                    onClick={async () => {
                      const token = useChatStore.getState().token;
                      await fetch('/api/ai/document-memory', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ action: 'feedback', memoryId: extractMemoryId, satisfied: false, feedback: 'يرجى إعادة التوليد بتفاصيل أكثر' }),
                      });
                      setExtractStatus('idle');
                      // Re-trigger generation
                      if (extractMemoryId) {
                        setExtractStatus('generating');
                        setExtractMessage('🔄 جاري إعادة التوليد...');
                        const res = await fetch('/api/ai/document-memory', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ action: 'generate', memoryId: extractMemoryId }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setExtractPdfUrl(data.fileUrl);
                          setExtractStatus('done');
                          setExtractMessage('✅ تم إعادة الإنشاء!');
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-blue-500 text-blue-600 text-xs font-medium hover:bg-blue-500"
                  >
                    ↻ إعادة التوليد
                  </button>
                </div>
              )}
            </div>
          )}

          {extractStatus === 'error' && (
            <button onClick={() => setExtractStatus('idle')} className="text-xs text-muted-foreground">
              إغلاق
            </button>
          )}
        </motion.div>
      )}

      {/* Quiz Generation Indicator */}
      {(quizGenStatus === 'generating' || quizGenStatus === 'failed') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={cn(
            "fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg",
            quizGenStatus === 'failed'
              ? "bg-red-600 dark:bg-red-500 text-white shadow-red-500"
              : "bg-blue-600 dark:bg-blue-500 text-white shadow-blue-500"
          )}
          dir="rtl"
        >
          {quizGenStatus === 'generating' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm font-medium">جاري توليد الاختبار... 📝</span>
            </>
          ) : (
            <>
              <XCircle className="size-4" />
              <span className="text-sm font-medium">فشل توليد الاختبار — حاول مرة أخرى</span>
            </>
          )}
        </motion.div>
      )}

      {/* Islamic Panel (Desktop) */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {islamicPanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-shrink-0 border-r border-border overflow-hidden relative z-10 bg-card"
            >
              <div className="w-[300px] h-full">
                <IslamicPanel onQuickPrompt={handleIslamicPrompt} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Islamic Panel (Mobile) */}
      {isMobile && (
        <Sheet open={islamicPanelOpen} onOpenChange={setIslamicPanelOpen}>
          <SheetContent side="left" className="p-0 w-[300px] card border-border" dir="rtl">
            <SheetHeader className="sr-only">
              <SheetTitle>الوضع الإسلامي</SheetTitle>
              <SheetDescription>لوحة إسلامية</SheetDescription>
            </SheetHeader>
            <IslamicPanel onQuickPrompt={(prompt) => {
              handleIslamicPrompt(prompt);
              setIslamicPanelOpen(false);
            }} />
          </SheetContent>
        </Sheet>
      )}

      {/* Trace Panel (Desktop) */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {tracePanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-shrink-0 border-r border-border overflow-hidden relative z-10 bg-card"
            >
              <div className="w-[340px] h-full">
                <BackendTracePanel />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Trace Panel (Mobile) */}
      {isMobile && (
        <Sheet open={tracePanelOpen} onOpenChange={setTracePanelOpen}>
          <SheetContent side="left" className="p-0 w-[300px] card border-border" dir="rtl">
            <SheetHeader className="sr-only">
              <SheetTitle>تتبع النظام</SheetTitle>
              <SheetDescription>سجلات النظام</SheetDescription>
            </SheetHeader>
            <BackendTracePanel />
          </SheetContent>
        </Sheet>
      )}

      {/* Skills Panel (Desktop) */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {skillsPanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-shrink-0 border-r border-border overflow-hidden relative z-10 bg-card"
            >
              <div className="w-[340px] h-full">
                <SkillsPanel
                  isOpen={skillsPanelOpen}
                  onClose={() => setSkillsPanelOpen(false)}
                  activeModel={activeModel}
                  onModelSelect={setActiveModel}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Skills Panel (Mobile) */}
      {isMobile && (
        <Sheet open={skillsPanelOpen} onOpenChange={setSkillsPanelOpen}>
          <SheetContent side="left" className="p-0 w-[340px] max-w-[85vw] gap-0 overflow-hidden card border-border" dir="rtl">
            <SheetHeader className="sr-only">
              <SheetTitle>المهارات</SheetTitle>
              <SheetDescription>مهارات Anzaro AI</SheetDescription>
            </SheetHeader>
            <SkillsPanel
              isOpen={skillsPanelOpen}
              onClose={() => setSkillsPanelOpen(false)}
              activeModel={activeModel}
              onModelSelect={(modelId) => {
                setActiveModel(modelId);
                setSkillsPanelOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Tools Gallery (Desktop) */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {toolsGalleryOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-shrink-0 border-r border-border overflow-hidden relative z-10 bg-card"
            >
              <div className="w-[340px] h-full">
                <ToolsGallery
                  isOpen={toolsGalleryOpen}
                  onClose={() => setToolsGalleryOpen(false)}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Tools Gallery (Mobile) */}
      {isMobile && (
        <Sheet open={toolsGalleryOpen} onOpenChange={setToolsGalleryOpen}>
          <SheetContent side="left" className="p-0 w-[340px] max-w-[85vw] gap-0 overflow-hidden card border-border" dir="rtl">
            <SheetHeader className="sr-only">
              <SheetTitle>الأدوات</SheetTitle>
              <SheetDescription>أدوات Anzaro AI الذكية</SheetDescription>
            </SheetHeader>
            <ToolsGallery
              isOpen={toolsGalleryOpen}
              onClose={() => setToolsGalleryOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Music Player Toggle Button — iOS-style floating button */}
      <button
        onClick={() => setMusicPlayerOpen(!musicPlayerOpen)}
        className="fixed bottom-24 left-4 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-[hsl(var(--primary))] text-white shadow-lg hover:scale-105 active:scale-95 transition-all ios-pressable"
        title="مشغل الموسيقى"
        aria-label="مشغل الموسيقى"
      >
        {musicPlayerOpen ? <XCircle className="h-5 w-5" /> : <Music className="h-5 w-5" />}
      </button>

      {/* Music Player Panel (Desktop) */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {musicPlayerOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-shrink-0 border-r border-border overflow-hidden relative z-10 bg-card"
            >
              <div className="w-[340px] h-full overflow-y-auto p-3">
                <MusicPlayer />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Music Player Panel (Mobile) */}
      {isMobile && (
        <Sheet open={musicPlayerOpen} onOpenChange={setMusicPlayerOpen}>
          <SheetContent side="left" className="p-0 w-[340px] max-w-[85vw] gap-0 overflow-hidden card border-border" dir="rtl">
            <SheetHeader className="sr-only">
              <SheetTitle>الموسيقى</SheetTitle>
              <SheetDescription>مشغل الموسيقى</SheetDescription>
            </SheetHeader>
            <div className="p-3">
              <MusicPlayer />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Smart Ball floating overlay — orb + control panel (devices/scenes/routines) */}
      <SmartBallOverlay />

      {/* iOS-style clean — no extra CSS animations needed */}
    </div>
  );
}
