'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, MicOff, Paperclip, Slash, X, FileText, Image as ImageIcon, Film, File, Loader2, Sparkles, Layers, Globe } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { isQuizIntent, extractTopicFromMessage } from '@/lib/quiz-intent';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';

// ─── Constants ────────────────────────────────────────────────────────
const MAX_FILES = 12;
const BATCH_THRESHOLD = 3; // Show batch indicator when 3+ files

// ─── File Type Helpers ────────────────────────────────────────────────
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'js', 'ts', 'py', 'html', 'css', 'xml',
  'yaml', 'yml', 'log', 'ini', 'cfg', 'conf', 'env', 'sh', 'bat', 'sql',
  'rb', 'php', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'swift', 'kt',
  'tsx', 'jsx', 'vue', 'svelte', 'toml', 'makefile', 'dockerfile',
  'gitignore', 'editorconfig', 'prettierrc', 'eslintrc', 'babelrc',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

const MAX_TEXT_CONTENT_SIZE = 100 * 1024; // 100KB max text content per file
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB max image size

type FileCategory = 'text' | 'image' | 'pdf' | 'docx' | 'other';

function getFileCategory(file: File): FileCategory {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  // DOCX (Word) files — read as data URL, extracted server-side via mammoth
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return 'docx';
  }
  if (file.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  if (
    file.type === 'application/json' ||
    file.type === 'application/xml' ||
    file.type === 'application/javascript' ||
    file.type === 'application/x-yaml' ||
    file.type === 'application/x-sh'
  ) {
    return 'text';
  }
  return 'other';
}

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
  content?: string; // Text content for text files, base64 data URL for images/PDFs
  category: FileCategory;
  contentReady: boolean;
  readError?: string;
}

interface SlashCommand {
  label: string;
  description: string;
  prefix: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { label: '/صورة', description: 'توليد صورة بالذكاء الاصطناعي', prefix: '/صورة' },
  { label: '/فيديو', description: 'توليد فيديو بالذكاء الاصطناعي', prefix: '/فيديو' },
  { label: '/بحث', description: 'البحث في الويب والحصول على مصادر', prefix: '/بحث' },
  { label: '/بيانات', description: 'تحليل بيانات CSV/Excel بالذكاء الاصطناعي', prefix: '/بيانات' },
  { label: '/مسح', description: 'مسح المحادثة الحالية', prefix: '/مسح' },
  { label: '/نموذج', description: 'تغيير النموذج النشط', prefix: '/نموذج' },
  { label: '/ترجمة', description: 'ترجمة النص التالي', prefix: '/ترجمة' },
  { label: '/كود', description: 'تبديل لنموذج البرمجة', prefix: '/كود' },
  { label: '/مصري', description: 'تبديل للعامية المصرية', prefix: '/مصري' },
  { label: '/شاعر', description: 'تبديل لنموذج الشعر', prefix: '/شاعر' },
  { label: '/طبيب', description: 'تبديل لنموذج الطب', prefix: '/طبيب' },
  { label: '/قانون', description: 'تبديل لنموذج القانون', prefix: '/قانون' },
  { label: '/تحليل', description: 'تحليل شامل للملفات + إنشاء ملف PDF مجمع', prefix: '/تحليل' },
  { label: '/ملفاتي', description: 'إنشاء ملفات (PDF/PPTX) بالذكاء الاصطناعي — النظام الموحد', prefix: '/ملفاتي' },
  { label: '/استخراج', description: 'استخراج كل القوانين من الملفات المرفقة وإنشاء PDF مجمع', prefix: '/استخراج' },
  { label: '/ملف', description: 'إنشاء مستند (PDF/PPTX) بالذكاء الاصطناعي', prefix: '/ملف' },
  { label: '/ملخص', description: 'تلخيص محاضرات وإنشاء مستند أكاديمي', prefix: '/ملخص' },
  { label: '/تشغيل', description: 'فتح صندوق الأكواد لتشغيل الكود', prefix: '/تشغيل' },
  { label: '/اختبار', description: 'توليد اختبار من أي موضوع', prefix: '/اختبار' },
  { label: '/quiz', description: 'Generate a quiz from any topic', prefix: '/quiz' },
  { label: '/خريطة', description: 'إنشاء خريطة ذهنية تفاعلية', prefix: '/خريطة' },
  { label: '/بودكاست', description: 'تحويل المحتوى إلى بودكاست صوتي', prefix: '/بودكاست' },
  { label: '/وكيل', description: 'تفعيل وضع الوكيل الذكي للمهام المعقدة', prefix: '/وكيل' },
  { label: '/صوت', description: 'فتح الدردشة الصوتية المباشرة', prefix: '/صوت' },
  { label: '/إنجازات', description: 'عرض الإنجازات والمستوى', prefix: '/إنجازات' },
];

function getFileIcon(attachment: AttachedFile) {
  switch (attachment.category) {
    case 'image':
      return <ImageIcon className="size-3.5 text-purple-500" />;
    case 'pdf':
      return <FileText className="size-3.5 text-red-500" />;
    case 'docx':
      return <FileText className="size-3.5 text-blue-500" />;
    default:
      if (attachment.file.type.startsWith('video/')) return <Film className="size-3.5 text-cyan-500" />;
      return <File className="size-3.5 text-amber-500" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── File Reading Utilities ───────────────────────────────────────────
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text.length > MAX_TEXT_CONTENT_SIZE) {
        resolve(text.slice(0, MAX_TEXT_CONTENT_SIZE) + '\n\n[... تم اقتطاع المحتوى - الملف كبير جداً]');
      } else {
        resolve(text);
      }
    };
    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => reject(new Error('فشل في قراءة الصورة'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress and resize an image file to prevent server crashes.
 * Large base64 images (1MB+) cause "Maximum call stack size exceeded" in regex.
 * Uses canvas to resize to maxWidth and compress with quality.
 */
function compressImage(file: File, maxWidth: number = 1280, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('فشل في تحميل الصورة'));
      img.src = ev.target?.result as string;
    };
    reader.onerror = () => reject(new Error('فشل في قراءة الصورة'));
    reader.readAsDataURL(file);
  });
}

export function ChatInput() {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  // V.48: Separate state for PDF upload — don't reuse isTranscribing (blocks send button)
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  // Google connection state (من NextAuth session)
  const { data: session, status: sessionStatus } = useSession();
  const googleConnected = sessionStatus === 'authenticated' && !!session?.accessToken && (session.user as any)?.provider === 'google';
  const [isManualSearching, setIsManualSearching] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashContainerRef = useRef<HTMLDivElement>(null);
  const { isStreaming, isBatchProcessing, sendMessage, processBatchFiles, activeModel, autoWebSearch, setAutoWebSearch, stopStreaming } = useChatStore();

  const charCount = value.length;
  const maxRows = 5;
  const lineHeight = 24;

  const isDisabled = isStreaming || isBatchProcessing || isTranscribing;

  // Batch mode detection: 3+ files that are ready
  const isBatchMode = useMemo(() => {
    const readyCount = attachments.filter((a) => a.contentReady && !a.readError).length;
    return readyCount >= BATCH_THRESHOLD;
  }, [attachments]);

  const anyAttachmentLoading = attachments.some((a) => !a.contentReady);
  const hasContent = value.trim() || attachments.length > 0;

  // ─── Voice Input (ASR) ────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        if (audioBlob.size < 1000) {
          // Too small, probably no actual speech
          setIsRecording(false);
          return;
        }

        setIsRecording(false);
        setIsTranscribing(true);

        try {
          const token = useAuthStore.getState().token;
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('language', 'ar');

          const response = await fetch('/api/ai/asr', {
            method: 'POST',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: formData,
          });

          if (!response.ok) {
            let errorMsg = 'فشل في تحويل الصوت';
            try {
              const errData = await response.json();
              errorMsg = errData.error || errorMsg;
            } catch {
              // Non-JSON response
            }
            throw new Error(errorMsg);
          }

          const data = await response.json();
          if (data.text) {
            setValue((prev) => {
              const separator = prev.trim() ? ' ' : '';
              return prev + separator + data.text;
            });
            // Focus textarea after inserting text
            setTimeout(() => textareaRef.current?.focus(), 100);
          }
        } catch (error) {
          console.error('[ASR] Error:', error);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('[Mic] Error accessing microphone:', error);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = lineHeight * maxRows + 16;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Handle file selection - reads file content immediately
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const currentCount = attachments.length;
    const availableSlots = MAX_FILES - currentCount;

    if (availableSlots <= 0) {
      // Already at max
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const filesToAdd = Array.from(files).slice(0, availableSlots);

    filesToAdd.forEach((file) => {
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const category = getFileCategory(file);

      const attachment: AttachedFile = {
        id,
        file,
        category,
        contentReady: false,
      };

      // Add attachment immediately in "loading" state
      setAttachments((prev) => {
        // Enforce max 12 files
        if (prev.length >= MAX_FILES) return prev;
        return [...prev, attachment];
      });

      // Read file content based on category
      if (category === 'text') {
        readFileAsText(file)
          .then((content) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id ? { ...a, content, contentReady: true } : a
              )
            );
          })
          .catch((err) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id ? { ...a, contentReady: true, readError: err.message } : a
              )
            );
          });
      } else if (category === 'image') {
        if (file.size > MAX_IMAGE_SIZE) {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, contentReady: true, readError: 'الصورة كبيرة جداً (الحد الأقصى 10 ميجابايت)' }
                : a
            )
          );
          return;
        }
        compressImage(file, 1280, 0.8)
          .then((dataUrl) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id
                  ? { ...a, preview: dataUrl, content: dataUrl, contentReady: true }
                  : a
              )
            );
          })
          .catch((err) => {
            console.warn('Image compression failed, using original:', err);
            readFileAsDataURL(file)
              .then((dataUrl) => setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, preview: dataUrl, content: dataUrl, contentReady: true } : a)))
              .catch((err) => setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, contentReady: true, readError: err.message } : a)));
          });
      } else if (category === 'pdf' || category === 'docx') {
        readFileAsDataURL(file)
          .then((dataUrl) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id ? { ...a, content: dataUrl, contentReady: true } : a
              )
            );
          })
          .catch((err) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id ? { ...a, contentReady: true, readError: err.message } : a
              )
            );
          });
      } else {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, contentReady: true } : a
          )
        );
      }
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [attachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Build message content with actual file content embedded
  // V.44: Upload large PDFs separately to avoid 5MB+ inline base64
  const uploadPdfSeparately = useCallback(async (att: AttachedFile): Promise<string | null> => {
    if (att.category !== 'pdf' || !att.file) return null;
    // Only upload if > 500KB (smaller PDFs can go inline)
    if (att.file.size < 500 * 1024) return null;

    try {
      const token = useAuthStore.getState().token;
      const formData = new FormData();
      formData.append('file', att.file);

      const resp = await fetch('/api/chat/upload-pdf', {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });

      if (resp.ok) {
        const data = await resp.json();
        // Return a reference marker instead of the base64 data
        return `[DELTA_PDF_REF:${data.fileId}:${data.fileName}:${data.fileSizeLabel}]`;
      }
    } catch (err) {
      console.warn('[ChatInput] PDF upload failed, falling back to inline:', err);
    }
    return null;
  }, []);

  const buildMessageWithAttachments = useCallback((userText: string, attachs: AttachedFile[], pdfRefs?: Map<string, string>): string => {
    if (attachs.length === 0) return userText;

    const parts: string[] = [];

    for (const att of attachs) {
      const size = formatFileSize(att.file.size);
      const ref = pdfRefs?.get(att.id);

      if (att.category === 'text' && att.content) {
        parts.push(`📎 ملف مرفق: ${att.file.name} (${size})`);
        parts.push('--- محتوى الملف ---');
        parts.push(att.content);
        parts.push('--- نهاية الملف ---');
      } else if (att.category === 'image' && att.content) {
        parts.push(`📷 صورة مرفقة: ${att.file.name} (${size})`);
        parts.push(`[DELTA_IMAGE:${att.content}]`);
      } else if (att.category === 'pdf' && att.content) {
        if (ref) {
          // V.44: Use uploaded reference instead of inline base64
          parts.push(`📄 ملف PDF مرفق: ${att.file.name} (${size})`);
          parts.push(ref);
        } else {
          parts.push(`📄 ملف PDF مرفق: ${att.file.name} (${size})`);
          parts.push(`[DELTA_PDF:${att.content}]`);
        }
      } else if (att.category === 'docx' && att.content) {
        parts.push(`📄 ملف Word مرفق: ${att.file.name} (${size})`);
        parts.push(`[DELTA_DOCX:${att.content}]`);
      } else {
        const emoji = att.category === 'pdf' ? '📄' : '📁';
        parts.push(`${emoji} ملف مرفق: ${att.file.name} (${size})`);
        if (att.readError) {
          parts.push(`(تعذرت قراءة الملف: ${att.readError})`);
        } else {
          parts.push('(نوع الملف غير مدعوم للقراءة المباشرة)');
        }
      }
    }

    const fileSection = parts.join('\n');
    return userText ? fileSection + '\n\n' + userText : fileSection;
  }, []);

  // ─── Batch Analysis Handler ──────────────────────────────────────────
  const handleBatchAnalysis = useCallback(async () => {
    if (!isBatchMode || isDisabled) return;

    // Collect files that are ready for batch processing
    const batchFiles = attachments
      .filter((a) => a.contentReady && !a.readError && a.content)
      .map((a) => ({
        name: a.file.name,
        content: a.content!,
        type: a.category,
      }));

    if (batchFiles.length < BATCH_THRESHOLD) return;

    setValue('');
    setAttachments([]);
    setShowSlashCommands(false);

    await processBatchFiles(batchFiles);
  }, [attachments, isBatchMode, isDisabled, processBatchFiles]);

  // ─── Manual Force Search Handler ──────────────────────────────────
  const handleForceSearch = useCallback(async () => {
    const trimmed = value.trim();
    const anyLoading = attachments.some((a) => !a.contentReady);
    if (!trimmed || isDisabled || anyLoading || isManualSearching) return;

    setIsManualSearching(true);

    try {
      // V.44: Upload large PDFs separately
      const pdfRefs = new Map<string, string>();
      const largePdfs = attachments.filter(a => a.category === 'pdf' && a.file && a.file.size >= 500 * 1024);
      if (largePdfs.length > 0) {
        setIsUploadingPdf(true);
        try {
          await Promise.all(largePdfs.map(async (att) => {
            const ref = await uploadPdfSeparately(att);
            if (ref) pdfRefs.set(att.id, ref);
          }));
        } finally {
          setIsUploadingPdf(false);
        }
      }

      // Build message content with actual file content
      const messageContent = buildMessageWithAttachments(trimmed, attachments, pdfRefs);

      setValue('');
      setAttachments([]);
      setShowSlashCommands(false);

      await sendMessage(messageContent, undefined, true);
    } finally {
      setIsManualSearching(false);
    }
  }, [value, attachments, isDisabled, isManualSearching, sendMessage, buildMessageWithAttachments]);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    const anyLoading = attachments.some((a) => !a.contentReady);
    if ((!trimmed && attachments.length === 0) || isDisabled || anyLoading) return;

    // Check for /تحليل batch command
    if (trimmed === '/تحليل' || trimmed === '/تحليل شامل') {
      if (isBatchMode) {
        await handleBatchAnalysis();
        return;
      }
    }

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      const command = SLASH_COMMANDS.find((c) => trimmed.startsWith(c.prefix));

      // /اختبار and /quiz open the QuizGenerator
      if (command && (command.prefix === '/اختبار' || command.prefix === '/quiz')) {
        const quizTopic = trimmed.replace(/^\/(اختبار|quiz)\s*/, '').trim();
        // If a topic is provided, auto-generate the quiz directly via API
        // Otherwise, just open the dialog for manual setup
        if (quizTopic) {
          // Open the quiz dialog immediately
          window.dispatchEvent(new CustomEvent('delta-ai-quiz', {
            detail: { topic: quizTopic, autoGenerate: true }
          }));
        } else {
          window.dispatchEvent(new CustomEvent('delta-ai-quiz', {
            detail: { topic: '' }
          }));
        }
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /بيانات opens the DataAnalysisPanel
      if (command && command.prefix === '/بيانات') {
        window.dispatchEvent(new CustomEvent('delta-ai-data-analysis'));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /تشغيل opens the CodeSandbox
      if (command && command.prefix === '/تشغيل') {
        window.dispatchEvent(new CustomEvent('delta-ai-code-sandbox', {
          detail: {}
        }));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /خريطة opens the MindMapViewer
      if (command && command.prefix === '/خريطة') {
        const mindmapTopic = trimmed.replace(/^\/خريطة\s*/, '').trim();
        window.dispatchEvent(new CustomEvent('delta-ai-mindmap', {
          detail: { topic: mindmapTopic }
        }));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /بودكاست opens the PodcastStudio
      if (command && command.prefix === '/بودكاست') {
        const podcastContent = trimmed.replace(/^\/بودكاست\s*/, '').trim();
        window.dispatchEvent(new CustomEvent('delta-ai-podcast', {
          detail: { content: podcastContent }
        }));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /وكيل opens the AgentMode
      if (command && command.prefix === '/وكيل') {
        const agentTask = trimmed.replace(/^\/وكيل\s*/, '').trim();
        window.dispatchEvent(new CustomEvent('delta-ai-agent', {
          detail: { task: agentTask }
        }));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /إنجازات opens the GamificationPanel
      if (command && command.prefix === '/إنجازات') {
        window.dispatchEvent(new CustomEvent('delta-ai-gamification'));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /صوت opens the Voice Chat overlay
      if (command && command.prefix === '/صوت') {
        window.dispatchEvent(new CustomEvent('delta-ai-voice-chat'));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      // /ملفاتي, /ملف and /ملخص open the DocumentGenDialog
      if (command && (command.prefix === '/ملفاتي' || command.prefix === '/ملف' || command.prefix === '/ملخص')) {
        const docPrompt = trimmed.replace(/^\/(ملفاتي|ملف|ملخص)\s*/, '').trim();
        const docMode = command.prefix === '/ملخص' ? 'batch' : 'single';
        window.dispatchEvent(new CustomEvent('delta-ai-doc-gen', {
          detail: { prompt: docPrompt, mode: docMode, isMyFiles: command.prefix === '/ملفاتي' }
        }));
        setValue('');
        setAttachments([]);
        setShowSlashCommands(false);
        return;
      }

      if (command && command.prefix !== '/تحليل') {
        setValue(command.prefix + ' ');
        setShowSlashCommands(false);
        return;
      }
    }

    // Detect quiz intent BEFORE building message (we need the raw user text)
    const hasQuizIntentDetected = isQuizIntent(trimmed);
    const quizTopic = hasQuizIntentDetected ? extractTopicFromMessage(trimmed) : null;

    // V.44: Upload large PDFs separately before building message
    const pdfRefs = new Map<string, string>();
    const largePdfs = attachments.filter(a => a.category === 'pdf' && a.file && a.file.size >= 500 * 1024);
    if (largePdfs.length > 0) {
      // V.48: Use isUploadingPdf (not isTranscribing) so send button isn't blocked
      setIsUploadingPdf(true);
      try {
        await Promise.all(largePdfs.map(async (att) => {
          const ref = await uploadPdfSeparately(att);
          if (ref) pdfRefs.set(att.id, ref);
        }));
      } finally {
        setIsUploadingPdf(false);
      }
    }

    // Build message content with actual file content (using refs for large PDFs)
    const messageContent = buildMessageWithAttachments(trimmed, attachments, pdfRefs);

    setValue('');
    setAttachments([]);
    setShowSlashCommands(false);

    // Send the message — adds user message synchronously, then starts stream
    const sendPromise = sendMessage(messageContent);

    // ── Client-side quiz generation fallback ──
    // If quiz intent is detected, also generate quiz directly via API.
    // This provides a reliable fallback if the stream route's quiz generation
    // fails (e.g., model timeout, rate limiting, or the streamClosed bug).
    // The stream route may also generate a quiz in parallel — whichever
    // finishes first and sets quizAutoData wins.
    if (hasQuizIntentDetected && quizTopic) {
      // Build conversation context from recent messages
      const state = useChatStore.getState();
      const conv = state.conversations.find((c) => c.id === state.activeConversationId);
      const recentMessages = conv?.messages || [];
      const convContext = recentMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map((m) => {
          const label = m.role === 'user' ? 'المستخدم' : 'المساعد';
          const content = m.content.length > 1500 ? m.content.slice(0, 1500) + '...' : m.content;
          return `${label}: ${content}`;
        })
        .join('\n\n');

      // Fire and forget — don't block the UI
      (async () => {
        try {
          const response = await fetch('/api/ai/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: quizTopic,
              conversationContext: convContext || undefined,
              questionCount: 10,
              difficulty: 'medium',
              types: ['mcq', 'true-false'],
            }),
          });

          if (response.ok) {
            const quizData = await response.json();
            // Only set if no quiz data has been set yet (stream route might have already set it)
            const currentState = useChatStore.getState();
            if (!currentState.quizAutoData) {
              useChatStore.getState().setQuizAutoData({
                ...quizData,
                source: 'chat',
              });
            }
          } else {
            // Only set failed if stream hasn't already provided quiz data
            const currentState = useChatStore.getState();
            if (!currentState.quizAutoData && currentState.quizGenStatus === 'generating') {
              useChatStore.getState().setQuizGenStatus('failed');
            }
          }
        } catch (err) {
          console.error('[Quiz] Client-side generation failed:', err);
          // Only set failed if stream hasn't already provided quiz data
          const currentState = useChatStore.getState();
          if (!currentState.quizAutoData && currentState.quizGenStatus === 'generating') {
            useChatStore.getState().setQuizGenStatus('failed');
          }
        }
      })();
    }

    await sendPromise;
  }, [value, attachments, isDisabled, sendMessage, buildMessageWithAttachments, isBatchMode, handleBatchAnalysis]);


  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSlashCommands) {
        const filtered = SLASH_COMMANDS.filter((c) =>
          c.prefix.includes(slashFilter) || c.label.includes(slashFilter)
        );
        if (filtered.length > 0) {
          const command = filtered[0];
          setValue(command.prefix + ' ');
          setShowSlashCommands(false);
        }
        return;
      }
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setShowSlashCommands(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Detect slash commands
    if (newValue.startsWith('/') || newValue.startsWith('／')) {
      const filter = newValue.slice(1).trim();
      setSlashFilter(filter);
      setShowSlashCommands(true);
    } else {
      setShowSlashCommands(false);
    }
  };

  const handleSlashCommandClick = (command: SlashCommand) => {
    if (command.prefix === '/تحليل' && isBatchMode) {
      handleBatchAnalysis();
      return;
    }
    // /اختبار and /quiz open the QuizGenerator
    if (command.prefix === '/اختبار' || command.prefix === '/quiz') {
      const quizTopic = value.replace(/^\/(اختبار|quiz)\s*/, '').trim();
      if (quizTopic) {
        window.dispatchEvent(new CustomEvent('delta-ai-quiz', {
          detail: { topic: quizTopic, autoGenerate: true }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('delta-ai-quiz', {
          detail: { topic: '' }
        }));
      }
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /بيانات opens the DataAnalysisPanel
    if (command.prefix === '/بيانات') {
      window.dispatchEvent(new CustomEvent('delta-ai-data-analysis'));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /تشغيل opens the CodeSandbox
    if (command.prefix === '/تشغيل') {
      window.dispatchEvent(new CustomEvent('delta-ai-code-sandbox', {
        detail: {}
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /خريطة opens the MindMapViewer
    if (command.prefix === '/خريطة') {
      window.dispatchEvent(new CustomEvent('delta-ai-mindmap', {
        detail: { topic: '' }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /بودكاست opens the PodcastStudio
    if (command.prefix === '/بودكاست') {
      window.dispatchEvent(new CustomEvent('delta-ai-podcast', {
        detail: { content: '' }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /وكيل opens the AgentMode
    if (command.prefix === '/وكيل') {
      window.dispatchEvent(new CustomEvent('delta-ai-agent', {
        detail: { task: '' }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /إنجازات opens the GamificationPanel
    if (command.prefix === '/إنجازات') {
      window.dispatchEvent(new CustomEvent('delta-ai-gamification'));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /صوت opens the Voice Chat overlay
    if (command.prefix === '/صوت') {
      window.dispatchEvent(new CustomEvent('delta-ai-voice-chat'));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /استخراج — user uploads files + writes ANY request → model is free to execute
    if (command.prefix === '/استخراج') {
      // Pass whatever the user typed (if anything). No hardcoded default.
      // The model reads the user's request and decides what to do.
      const extractRequest = value.replace(/^\/استخراج\s*/, '').trim();
      window.dispatchEvent(new CustomEvent('delta-ai-extract-files', {
        detail: { request: extractRequest }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /ملفاتي, /ملف and /ملخص open the DocumentGenDialog
    if (command.prefix === '/ملفاتي' || command.prefix === '/ملف' || command.prefix === '/ملخص') {
      const docMode = command.prefix === '/ملخص' ? 'batch' : 'single';
      window.dispatchEvent(new CustomEvent('delta-ai-doc-gen', {
        detail: { prompt: '', mode: docMode, isMyFiles: command.prefix === '/ملفاتي' }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /صورة opens the ImageGenDialog
    if (command.prefix === '/صورة') {
      const imgPrompt = value.replace(/^\/صورة\s*/, '').trim();
      window.dispatchEvent(new CustomEvent('delta-ai-image-gen', {
        detail: { prompt: imgPrompt }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /فيديو opens the VideoGenDialog
    if (command.prefix === '/فيديو') {
      const vidPrompt = value.replace(/^\/فيديو\s*/, '').trim();
      window.dispatchEvent(new CustomEvent('delta-ai-video-gen', {
        detail: { prompt: vidPrompt }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /ترجمة — insert translation template and focus
    if (command.prefix === '/ترجمة') {
      setValue('/ترجمة ');
      setShowSlashCommands(false);
      textareaRef.current?.focus();
      return;
    }

    // /كود — switch to the coder model
    if (command.prefix === '/كود') {
      window.dispatchEvent(new CustomEvent('delta-ai-switch-model', {
        detail: { model: 'delta-coder' }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /مصري /شاعر /طبيب /قانون — switch persona model
    if (command.prefix === '/مصري' || command.prefix === '/شاعر' || command.prefix === '/طبيب' || command.prefix === '/قانون') {
      const modelMap: Record<string, string> = {
        '/مصري': 'delta-egypt',
        '/شاعر': 'delta-poet',
        '/طبيب': 'delta-medical',
        '/قانون': 'delta-legal',
      };
      window.dispatchEvent(new CustomEvent('delta-ai-switch-model', {
        detail: { model: modelMap[command.prefix] }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    // /بحث opens the web search dialog (dispatch event for ChatApp)
    if (command.prefix === '/بحث') {
      const searchQuery = value.replace(/^\/بحث\s*/, '').trim();
      window.dispatchEvent(new CustomEvent('delta-ai-search', {
        detail: { query: searchQuery }
      }));
      setValue('');
      setShowSlashCommands(false);
      return;
    }

    setValue(command.prefix + ' ');
    setShowSlashCommands(false);
    textareaRef.current?.focus();
  };

  const filteredCommands = SLASH_COMMANDS.filter(
    (c) => c.prefix.includes(slashFilter) || c.label.includes(slashFilter)
  );

  const charColor =
    charCount > 1000
      ? 'text-red-500'
      : charCount > 500
        ? 'text-yellow-500'
        : 'text-muted-foreground';

  const readyFileCount = attachments.filter((a) => a.contentReady && !a.readError).length;

  return (
    <div className="relative px-1.5 sm:px-3 pb-1">
      {/* Slash Commands Popup */}
      <AnimatePresence>
        {showSlashCommands && filteredCommands.length > 0 && (
          <motion.div
            ref={slashContainerRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-2 right-3 sm:right-6 left-3 sm:left-6 max-w-3xl mx-auto bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50"
          >
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                <Slash className="size-3.5" />
                <span>أوامر سريعة</span>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredCommands.map((cmd, i) => (
                <button
                  key={i}
                  onClick={() => handleSlashCommandClick(cmd)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-right min-h-[44px]",
                    cmd.prefix === '/تحليل' && !isBatchMode && 'opacity-50'
                  )}
                >
                  <span className={cn(
                    "font-mono text-sm",
                    cmd.prefix === '/تحليل'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  )}>
                    {cmd.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {cmd.prefix === '/تحليل' && !isBatchMode
                      ? 'يتطلب 3 ملفات على الأقل'
                      : cmd.description}
                  </span>
                  {cmd.prefix === '/تحليل' && isBatchMode && (
                    <span className="mr-auto text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                      متاح
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Attachments Preview */}
      <div className="max-w-3xl mx-auto">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2"
            >
              {/* Batch Processing Indicator — shown when 3+ files */}
              <AnimatePresence>
                {isBatchMode && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-2 p-2.5 rounded-xl bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/60 dark:border-amber-800/40"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center size-7 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                        <Layers className="size-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          وضع التحليل والملف المجمع
                        </p>
                        <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60">
                          {readyFileCount} ملفات — سيتم التحليل + إنشاء ملف PDF مجمع تلقائياً
                        </p>
                      </div>
                      <motion.button
                        onClick={handleBatchAnalysis}
                        disabled={isDisabled}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                          !isDisabled
                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                            : 'bg-amber-200 dark:bg-amber-800/40 text-amber-400 cursor-not-allowed'
                        )}
                        whileHover={!isDisabled ? { scale: 1.05 } : {}}
                        whileTap={!isDisabled ? { scale: 0.95 } : {}}
                        aria-label="تحليل شامل"
                      >
                        <Sparkles className="size-3.5" />
                        <span>تحليل + ملف</span>
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* File List */}
              <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-xl border border-border/50">
                {attachments.map((attachment) => (
                  <motion.div
                    key={attachment.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative group flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border/50 text-xs max-w-[200px]"
                  >
                    {/* Preview */}
                    {attachment.preview ? (
                      <div className="size-8 rounded overflow-hidden flex-shrink-0">
                        <img
                          src={attachment.preview}
                          alt={attachment.file.name}
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="size-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        {getFileIcon(attachment)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {attachment.file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {attachment.contentReady ? (
                          attachment.readError ? (
                            <span className="text-red-500 truncate">{attachment.readError}</span>
                          ) : (
                            <span>{formatFileSize(attachment.file.size)} ✓</span>
                          )
                        ) : (
                          <>
                            <Loader2 className="size-2.5 animate-spin" />
                            <span>جاري القراءة...</span>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => removeAttachment(attachment.id)}
                      className="absolute -top-1.5 -left-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      aria-label="إزالة الملف"
                    >
                      <X className="size-3" />
                    </button>
                  </motion.div>
                ))}

                {/* File Count Badge */}
                <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground">
                  <Layers className="size-3" />
                  <span>{attachments.length}/{MAX_FILES}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div
          className={cn(
            'relative flex items-end gap-1 rounded-xl border bg-card/80 backdrop-blur-lg p-0.5 transition-all duration-200',
            isFocused
              ? isBatchMode
                ? 'border-amber-500/60 shadow-[0_0_0_2px_rgba(245,158,11,0.12)]'
                : 'border-emerald-500/50 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]'
              : isBatchMode
                ? 'border-amber-500/30 hover:border-amber-500/50'
                : 'border-border/80 hover:border-emerald-500/30',
            (isDisabled || anyAttachmentLoading) && 'opacity-60 pointer-events-none'
          )}
        >
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.pptx,.mp4,.avi,.mov,.json,.js,.ts,.py,.html,.css,.xml,.yaml,.yml,.md,.sql,.sh,.env"
            onChange={handleFileSelect}
            className="hidden"
            aria-label="اختيار ملفات"
          />

          {/* Attach Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex-shrink-0 p-1 rounded-lg hover:bg-accent transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center',
              attachments.length >= MAX_FILES
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label="إرفاق ملف"
            disabled={isDisabled || anyAttachmentLoading || attachments.length >= MAX_FILES}
          >
            <Paperclip className="size-4" />
          </button>

          {/* Textarea with inline Globe indicator */}
          <div className="relative flex-1 flex items-end">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={
                isBatchMode
                  ? "اكتب /تحليل للتحليل الشامل أو أضف وصفاً..."
                  : attachments.length > 0
                    ? "أضف وصفاً للملفات المرفقة..."
                    : "اكتب رسالتك هنا..."
              }
              className={cn(
                'w-full resize-none bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm leading-6',
                'min-h-[36px] max-h-[136px] py-1.5',
                autoWebSearch ? 'pe-6' : ''
              )}
              rows={1}
              disabled={isDisabled || anyAttachmentLoading}
              dir="auto"
            />
            {/* Tiny Auto Web Search Toggle — inside textarea at end side */}
            <button
              onClick={() => setAutoWebSearch(!autoWebSearch)}
              className={cn(
                'absolute end-1.5 bottom-1.5 p-0.5 rounded-full transition-colors z-10',
                autoWebSearch
                  ? 'text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300'
                  : 'text-muted-foreground/40 hover:text-muted-foreground/70'
              )}
              aria-label={autoWebSearch ? 'إيقاف البحث التلقائي في الويب' : 'تفعيل البحث التلقائي في الويب'}
              title={autoWebSearch ? 'البحث التلقائي مُفعّل — اضغط للإيقاف' : 'تفعيل البحث التلقائي في الويب'}
              disabled={isDisabled || anyAttachmentLoading}
            >
              <Globe className="size-3.5" />
              {autoWebSearch && (
                <span className="absolute -top-0.5 -end-0.5 flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                </span>
              )}
            </button>
          </div>

          {/* Mic or Send / Batch — single slot on the right */}
          {(isRecording || isTranscribing) ? (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                'flex-shrink-0 p-1.5 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center',
                isRecording
                  ? 'bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-950/50'
                  : 'bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
              )}
              aria-label={isRecording ? 'إيقاف التسجيل' : 'جاري التحويل...'}
              disabled={isDisabled || anyAttachmentLoading}
            >
              {isTranscribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <div className="relative flex items-center justify-center">
                  <MicOff className="size-4" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                </div>
              )}
            </button>
          ) : !hasContent ? (
            <button
              onClick={startRecording}
              className={cn(
                'flex-shrink-0 p-1.5 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center',
                'hover:bg-accent text-muted-foreground hover:text-foreground'
              )}
              aria-label="إدخال صوتي"
              disabled={isDisabled || anyAttachmentLoading}
            >
              <Mic className="size-4" />
            </button>
          ) : isBatchMode && !value.trim() ? (
            <motion.button
              onClick={handleBatchAnalysis}
              disabled={isDisabled || anyAttachmentLoading}
              className={cn(
                'flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 min-h-[36px] min-w-[36px] flex items-center justify-center gap-1',
                !isDisabled && !anyAttachmentLoading
                  ? 'bg-amber-500 dark:bg-amber-500 text-white hover:bg-amber-600 dark:hover:bg-amber-600 shadow-md'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
              aria-label="تحليل شامل"
              animate={
                !isDisabled && !anyAttachmentLoading
                  ? { scale: [1, 1.05, 1] }
                  : { scale: 1 }
              }
              transition={
                { repeat: Infinity, duration: 2, ease: 'easeInOut' as const }
              }
            >
              {isBatchProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </motion.button>
          ) : (
              {/* V.50: Always show send button — sendMessage handles aborting previous stream */}
              <button
                onClick={handleSubmit}
                disabled={!hasContent || isBatchProcessing || isTranscribing || anyAttachmentLoading}
                className={cn(
                  'flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 min-h-[36px] min-w-[36px] flex items-center justify-center',
                  hasContent && !isBatchProcessing && !isTranscribing && !anyAttachmentLoading
                    ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black hover:bg-emerald-700 dark:hover:bg-emerald-600 shadow-md'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
                aria-label="إرسال"
              >
              {anyAttachmentLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4 rotate-180" />
              )}
            </button>
          )}
        </div>

        {/* Bottom hints */}
        <div className="flex items-center justify-between mt-1.5 px-2">
          <div className="flex items-center gap-2">
            {/* Google connection indicator */}
            {googleConnected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400" title="Google مربوط — الأدوات جاهزة">
                <svg viewBox="0 0 24 24" className="size-3" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
                </svg>
                Google متصل
              </span>
            ) : sessionStatus === 'loading' ? null : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70" title="Google مش مربوط — اربطه من Integration Dashboard">
                <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                Google غير متصل
              </span>
            )}
            <span className="text-[10px] text-muted-foreground" dir="rtl">
              {isBatchMode
                ? `🔍 ${readyFileCount} ملفات جاهزة • اضغط "تحليل شامل" أو اكتب /تحليل`
                : 'Enter للإرسال • Shift+Enter لسطر جديد'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {attachments.length > 0 && (
              <span className={cn(
                'text-[10px] font-mono',
                attachments.length >= MAX_FILES
                  ? 'text-red-500'
                  : attachments.length >= BATCH_THRESHOLD
                    ? 'text-amber-500'
                    : 'text-muted-foreground'
              )}>
                📎 {attachments.length}/{MAX_FILES}
              </span>
            )}
            <span className={cn('text-[10px] font-mono', charColor)}>
              {charCount > 0 ? charCount : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
