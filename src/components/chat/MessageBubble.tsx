'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  Clock,
  Copy,
  Check,
  FileText,
  Volume2,
  Pause,
  Play,
  StopCircle,
  Loader2,
  Lightbulb,
  Image as ImageIcon,
  File,
  FileType,
  Globe,
  ChevronDown,
  ExternalLink,
  XCircle,
  Download,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { CodeBlock } from './CodeBlock';
import { DocumentProgressCard } from './DocumentProgressCard';
import { DocumentReadyCard } from './DocumentReadyCard';
import { getModelById } from '@/lib/models';

import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';
import type { Message, SearchResult } from '@/store/chat-store';
import { toast } from 'sonner';
import { AudioPlayer } from './AudioPlayer';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

// Detect emotion emoji based on message content
function detectEmotion(content: string): string {
  if (!content) return '';
  const lower = content.toLowerCase();

  if (/شكر|جزاك|بارك|ممتاز|رائع|عظيم|❤️|💕|😊|😀|👍/.test(lower)) return '😊';
  if (/حزين|أسف|للأسف|مؤلم|😢|😭|💔/.test(lower)) return '😢';
  if (/غضب|معرفش|زهق|عصبي|😡|😠|🔥/.test(lower)) return '😤';
  if (/فكاهي|نكتة|ضحك|ههه|😂|🤣/.test(lower)) return '😂';
  if (/ماشي|تمام|أوكي|حسناً|👌|✅/.test(lower)) return '👌';
  if (/تفكير|تحليل|دراسة|مهم|🤔|💡/.test(lower)) return '🤔';
  if (/إسلام|قرآن|دعاء|حديث|🕌|🤲/.test(lower)) return '🕌';
  if (/كود|برمج|python|javascript|💻/.test(lower)) return '💻';

  return '';
}

// Detect image URLs in content
function detectImageUrls(content: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp))/gi;
  return content.match(urlRegex) || [];
}

// Parse user message with file attachments for display
interface DisplayAttachment {
  type: 'image' | 'text' | 'pdf' | 'other';
  name: string;
  size: string;
  imageDataUrl?: string; // For image previews
  textContent?: string; // For text file content preview
}

function parseUserMessageForDisplay(content: string): {
  userText: string;
  attachments: DisplayAttachment[];
} {
  const attachments: DisplayAttachment[] = [];
  let cleaned = content;

  // Extract image attachments: 📷 صورة مرفقة: name (size)\n[DELTA_IMAGE:data:...]
  const imageRegex = /📷 صورة مرفقة: (.+?) \((.+?)\)\n\[DELTA_IMAGE:(data:image\/[^\]]+)\]/g;
  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    attachments.push({
      type: 'image',
      name: match[1],
      size: match[2],
      imageDataUrl: match[3],
    });
    cleaned = cleaned.replace(match[0], '');
  }

  // Extract PDF attachments: 📄 ملف PDF مرفق: name (size)\n[DELTA_PDF:data:...]
  const pdfRegex = /📄 ملف PDF مرفق: (.+?) \((.+?)\)\n\[DELTA_PDF:data:[^\]]+\]/g;
  while ((match = pdfRegex.exec(content)) !== null) {
    attachments.push({
      type: 'pdf',
      name: match[1],
      size: match[2],
    });
    cleaned = cleaned.replace(match[0], '');
  }

  // Extract text file attachments: 📎 ملف مرفق: name (size)\n--- محتوى الملف ---\n...\n--- نهاية الملف ---
  const textFileRegex = /📎 ملف مرفق: (.+?) \((.+?)\)\n--- محتوى الملف ---\n([\s\S]*?)\n--- نهاية الملف ---/g;
  while ((match = textFileRegex.exec(content)) !== null) {
    const textContent = match[3];
    attachments.push({
      type: 'text',
      name: match[1],
      size: match[2],
      textContent: textContent.length > 200 ? textContent.slice(0, 200) + '...' : textContent,
    });
    cleaned = cleaned.replace(match[0], '');
  }

  // Extract unsupported file attachments
  const otherFileRegex = /📁 ملف مرفق: (.+?) \((.+?)\)(?:\n\([^)]*\))?/g;
  while ((match = otherFileRegex.exec(content)) !== null) {
    attachments.push({
      type: 'other',
      name: match[1],
      size: match[2],
    });
    cleaned = cleaned.replace(match[0], '');
  }

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return { userText: cleaned, attachments };
}

// Format file size for display
function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// TTS states
type TTSState = 'idle' | 'loading' | 'playing' | 'paused';

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const [showTime, setShowTime] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ttsState, setTtsState] = useState<TTSState>('idle');
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [searchResultsOpen, setSearchResultsOpen] = useState(true);

  // ═══════════════════════════════════════════════════════════════════════
  // WEB AUDIO API PLAYBACK — decodeAudioData + AudioBufferSourceNode
  // ═══════════════════════════════════════════════════════════════════════
  // This is the MOST RELIABLE audio path on mobile browsers:
  //   - decodeAudioData() decodes WAV/MP3 to raw PCM samples
  //   - AudioBufferSourceNode plays the PCM directly via the hardware
  //   - NO HTMLAudioElement, NO blob URL, NO data URI
  //   - NO NotSupportedError possible (WAV is universally decodable)
  //
  // The previous HTMLAudioElement + blob URL approach failed because
  // mobile browsers reject MPEG-2 Layer III MP3 with NotSupportedError.
  // WAV (RIFF PCM) + decodeAudioData bypasses this entirely.
  // ═══════════════════════════════════════════════════════════════════════
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  const { setActiveModel, documentGenProgress, documentGenResult } = useChatStore();

  const isUser = message.role === 'user';
  const model = message.model ? getModelById(message.model) : null;
  const emotion = useMemo(() => !isUser ? detectEmotion(message.content) : '', [message.content, isUser]);
  const imageUrls = useMemo(() => detectImageUrls(message.content), [message.content]);

  // Parse user message for file attachments display
  const parsedUserMessage = useMemo(() => {
    if (!isUser) return null;
    return parseUserMessageForDisplay(message.content);
  }, [message.content, isUser]);

  // Stop audio playback + release resources
  const stopAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch {}
      try { audioSourceRef.current.disconnect(); } catch {}
      audioSourceRef.current = null;
    }
    setTtsState('idle');
    setAudioProgress(0);
    pauseOffsetRef.current = 0;
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        try { void audioContextRef.current.close(); } catch {}
        audioContextRef.current = null;
      }
    };
  }, [stopAudio]);

  // Update progress during playback (uses AudioContext.currentTime)
  const updateProgressRef = useRef<(() => void) | null>(null);
  const updateProgress = useCallback(() => {
    const ctx = audioContextRef.current;
    const buf = audioBufferRef.current;
    if (!ctx || !buf) return;
    const elapsed = ctx.currentTime - startTimeRef.current;
    const duration = buf.duration;
    setAudioProgress(Math.min(elapsed / duration, 1));
    setAudioDuration(duration);
    if (elapsed < duration) {
      animationFrameRef.current = requestAnimationFrame(() => updateProgressRef.current?.());
    } else {
      setTtsState('idle');
      setAudioProgress(0);
      pauseOffsetRef.current = 0;
    }
  }, []);
  useEffect(() => { updateProgressRef.current = updateProgress; }, [updateProgress]);

  // ═══════════════════════════════════════════════════════════════════════
  // PLAY a Base64-encoded audio via Web Audio API (decodeAudioData).
  //
  // This is the MOST RELIABLE audio path on mobile browsers:
  //   1. Decode Base64 → Uint8Array → ArrayBuffer
  //   2. audioContext.decodeAudioData(arrayBuffer) → AudioBuffer (raw PCM)
  //   3. AudioBufferSourceNode → connect to destination → start()
  //
  // WHY THIS WORKS WHERE HTMLAudioElement FAILED:
  //   - decodeAudioData handles WAV/any format the browser supports
  //   - AudioBufferSourceNode plays raw PCM samples directly
  //   - NO media element, NO blob URL, NO format rejection
  //   - NotSupportedError is IMPOSSIBLE with WAV (universally decodable)
  // ═══════════════════════════════════════════════════════════════════════
  const playBase64 = useCallback(async (base64Data: string, mimeType: string = 'audio/wav', offset: number = 0): Promise<void> => {
    // ── STEP 1: Stop any previous playback ──
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch {}
      try { audioSourceRef.current.disconnect(); } catch {}
      audioSourceRef.current = null;
    }

    // ── STEP 2: Decode Base64 → binary → ArrayBuffer ──
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Diagnostic: hex dump of first 16 bytes
    const hexDump = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    console.log('[AudioDiagnostics] Decoded Base64 → ArrayBuffer:', {
      base64Length: base64Data.length,
      decodedByteLength: len,
      mimeType,
      first16BytesHex: hexDump,
      isRiffWav: isRiff,
      detectedFormat: isRiff ? 'WAV' : (bytes[0] === 0xff ? 'MP3' : 'UNKNOWN'),
    });

    if (len < 200) throw new Error('Decoded audio buffer too small');

    // ── STEP 3: Create/resume AudioContext (hardware unlock) ──
    if (!audioContextRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) throw new Error('AudioContext not supported');
      audioContextRef.current = new Ctor();
      console.log('[AudioDiagnostics] Created AudioContext:', audioContextRef.current.state);
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
      console.log('[AudioDiagnostics] AudioContext resumed:', ctx.state);
    }

    // ── STEP 4: decodeAudioData — decode WAV → raw PCM AudioBuffer ──
    console.log('[AudioDiagnostics] Calling decodeAudioData...');
    let audioBuffer: AudioBuffer;
    try {
      const arrayBuffer = bytes.buffer.slice(0);
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      console.log('[AudioDiagnostics] ✅ decodeAudioData succeeded:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
      });
    } catch (decodeErr: any) {
      console.error('[AudioDiagnostics] decodeAudioData failed:', decodeErr?.name, decodeErr?.message);
      throw decodeErr;
    }
    audioBufferRef.current = audioBuffer;

    // ── STEP 5: Create AudioBufferSourceNode + play ──
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      console.log('[AudioDiagnostics] Playback ended normally');
      setTtsState('idle');
      setAudioProgress(0);
      pauseOffsetRef.current = 0;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }
    };

    startTimeRef.current = ctx.currentTime - offset;
    source.start(0, offset);
    audioSourceRef.current = source;
    setTtsState('playing');
    animationFrameRef.current = requestAnimationFrame(updateProgress);

    console.log('[AudioDiagnostics] ✅ AudioBufferSourceNode started — audio is live');
  }, [updateProgress]);

  // ═══════════════════════════════════════════════════════════════════════
  // Handle TTS button click — Web Audio API (decodeAudioData)
  // ═══════════════════════════════════════════════════════════════════════
  const handleTTS = useCallback(async () => {
    // If currently playing → pause (store offset for resume)
    if (ttsState === 'playing') {
      const ctx = audioContextRef.current;
      if (ctx && audioBufferRef.current) {
        pauseOffsetRef.current = ctx.currentTime - startTimeRef.current;
      }
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch {}
        try { audioSourceRef.current.disconnect(); } catch {}
        audioSourceRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }
      setTtsState('paused');
      return;
    }

    // If paused → resume (reuse the same AudioBuffer — no re-fetch)
    if (ttsState === 'paused') {
      if (audioBufferRef.current && audioContextRef.current) {
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          try { await ctx.resume(); } catch {}
        }
        const source = ctx.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.connect(ctx.destination);
        source.onended = () => {
          setTtsState('idle');
          setAudioProgress(0);
          pauseOffsetRef.current = 0;
        };
        startTimeRef.current = ctx.currentTime - pauseOffsetRef.current;
        source.start(0, pauseOffsetRef.current);
        audioSourceRef.current = source;
        setTtsState('playing');
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      } else {
        setTtsState('idle');
      }
      return;
    }

    // Idle → fetch Edge TTS + play via decodeAudioData
    if (ttsState === 'idle') {
      setTtsState('loading');
      try {
        // ── UNLOCK audio hardware on this user gesture (click) ──
        if (!audioContextRef.current) {
          const Ctor = window.AudioContext || (window as any).webkitAudioContext;
          if (Ctor) audioContextRef.current = new Ctor();
        }
        if (audioContextRef.current?.state === 'suspended') {
          try { await audioContextRef.current.resume(); } catch {}
        }

        const authToken = useAuthStore.getState().token;
        // Cache-busting timestamp — forces Webpack/Next.js to bypass stale
        // route responses and fetch fresh from the server every time.
        const ttsUrl = `/api/ai/tts/edge?t=${Date.now()}`;
        const response = await fetch(ttsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            text: message.content.slice(0, 10000),
            voice: 'ar-EG-SalmaNeural',   // Egyptian Salma (female)
            speed: 1.0,
          }),
        });

        if (!response.ok) {
          let errorMsg = 'فشل خدمة الصوت';
          try { const errData = await response.json(); errorMsg = errData.error || errorMsg; } catch {}
          throw new Error(errorMsg);
        }

        // ═══ BASE64 JSON DATA-URI PIPELINE ═══
        // The backend returns JSON { audioData: "<base64>", voice, mimeType }.
        // We parse the JSON, extract the base64 string, and feed it directly
        // into the audio player via a Data URI: data:audio/mpeg;base64,...
        // This completely eliminates binary wire corruption — JSON is 100%
        // text-safe and Next.js cannot warp it during serialization.
        const data = await response.json();
        console.log('[AudioDiagnostics] Received JSON:', {
          hasAudioData: !!data.audioData,
          audioDataLength: data.audioData?.length,
          voice: data.voice,
          mimeType: data.mimeType,
          byteLength: data.byteLength,
          deliveryMode: 'base64-json',
        });
        if (!data.audioData || typeof data.audioData !== 'string') {
          throw new Error('لم يتم استلام صوت (audioData missing)');
        }
        if (data.audioData.length < 200) {
          throw new Error(`صوت قصير جداً (${data.audioData.length} chars)`);
        }

        pauseOffsetRef.current = 0;
        await playBase64(data.audioData, data.mimeType || 'audio/mpeg', 0);
      } catch (error) {
        console.error('[MessageBubble:TTS] error:', error);
        setTtsState('idle');
        toast.error('خدمة الصوت غير متاحة حالياً. حاول مرة أخرى.');
      }
    }
  }, [ttsState, message.content, playBase64, updateProgress]);

  // Handle stop
  const handleStopTTS = useCallback(() => {
    stopAudio();
  }, [stopAudio]);

  // Handle cross-mode suggestion click
  const handleSuggestionClick = useCallback((toModel: string) => {
    setActiveModel(toModel);
    const suggestedModel = getModelById(toModel);
    toast.success(`تم التحويل إلى ${suggestedModel?.nameEn || toModel} ✨`, {
      description: 'الرسالة القادمة ستستخدم النموذج الجديد',
    });
  }, [setActiveModel]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard failure
    }
  };

  // Generate a proper PDF from the message content via the server API
  const handleGeneratePDF = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const authToken = useAuthStore.getState().token;
      if (!authToken) {
        toast.error('يرجى تسجيل الدخول أولاً لإنشاء PDF');
        return;
      }

      // Derive a title from the content (first line or first 80 chars)
      const firstLine = message.content.split('\n').find((l) => l.trim()) || '';
      const title = firstLine.replace(/^#+\s*/, '').slice(0, 80) || 'Anzaro AI Response';

      // Step 1: Call the unified document generation API
      const genResponse = await fetch('/api/ai/hf/document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          mode: 'local',
          topic: title,
          language: message.language || 'ar',
          instructions: message.content,
        }),
      });

      if (!genResponse.ok) {
        const errorData = await genResponse.json().catch(() => ({ error: 'فشل إنشاء PDF' }));
        throw new Error(errorData.error || 'فشل إنشاء PDF');
      }

      const genData = await genResponse.json();
      if (!genData.success) {
        throw new Error(genData.error || 'فشل إنشاء PDF');
      }

      // Step 2: Download the generated PDF via the serve endpoint
      const fileUrl = genData.fileUrl || genData.filePath;
      if (!fileUrl) {
        throw new Error('لم يتم إرجاع رابط الملف');
      }

      const downloadResponse = await fetch(fileUrl.startsWith('/') ? fileUrl : `/api/pdf/serve/${fileUrl.split('/').pop()}`, {
        method: 'GET',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      if (!downloadResponse.ok) {
        throw new Error('فشل تحميل PDF');
      }

      // Step 3: Create a blob and trigger download
      const blob = await downloadResponse.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anzaro-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('تم إنشاء وتحميل PDF بنجاح');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error(
        error instanceof Error ? error.message : 'فشل إنشاء PDF. حاول مرة أخرى.'
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Download message content as plain text
  const handleDownloadText = () => {
    const content = message.content;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anzaro-response-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('تم تحميل الملف النصي');
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const formatAudioTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get TTS button icon based on state
  const getTTSIcon = () => {
    switch (ttsState) {
      case 'loading':
        return <Loader2 className="size-3 animate-spin" />;
      case 'playing':
        return <Pause className="size-3" />;
      case 'paused':
        return <Play className="size-3" />;
      default:
        return <Volume2 className="size-3" />;
    }
  };

  const getTTSLabel = () => {
    switch (ttsState) {
      case 'loading': return 'جاري التحميل...';
      case 'playing': return 'إيقاف مؤقت';
      case 'paused': return 'استكمال';
      default: return 'قراءة بصوت عالٍ';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] as const }}
      className={cn(
        'flex gap-3 w-full mb-2',
        isUser ? 'justify-end' : 'justify-start'
      )}
      style={{ willChange: 'transform' }}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
    >
      {/* AI avatar — Gemini sparkle logo (left side in RTL) */}
      {!isUser && (
        <div className="flex-shrink-0 mt-0.5">
          <div
            className="size-8 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--gemini-surface-2)',
              border: '1px solid var(--gemini-border-soft)',
            }}
          >
            <Sparkles className="size-4 text-[hsl(var(--primary))]" />
          </div>
        </div>
      )}

      <div className={cn('flex flex-col gap-0.5 max-w-[85%] sm:max-w-[80%]', isUser ? 'items-end' : 'items-start flex-1')}>
        {/* Model badge for assistant — minimal */}
        {!isUser && model && (
          <div className="flex items-center gap-1.5 mb-1 self-start">
            <span className="text-[12px] font-medium text-[var(--gemini-text-tertiary)]">
              {model.name}
            </span>
            {emotion && <span className="text-sm">{emotion}</span>}
          </div>
        )}

        {/* Bubble — Gemini minimal typography style */}
        <div
          className={cn(
            'relative text-[15px] leading-relaxed',
            isUser
              ? 'chat-bubble-user'
              : 'chat-bubble-assistant'
          )}
        >
          {/* Search Results Collapsible Card (assistant messages only, above the response) */}
          {!isUser && message.searchResults && message.searchResults.length > 0 && (
            <Collapsible open={searchResultsOpen} onOpenChange={setSearchResultsOpen} className="mb-3">
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors min-h-[36px]">
                  <Globe className="size-3.5 flex-shrink-0" />
                  <span className="font-medium">🔍 نتائج البحث ({message.searchResults.length})</span>
                  <ChevronDown className={cn('size-3.5 mr-auto transition-transform', searchResultsOpen && 'rotate-180')} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {message.searchResults.map((result: SearchResult, i: number) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 dark:bg-blue-200 dark:bg-blue-800 border border-blue-100 dark:border-blue-900 text-[11px]"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="text-blue-500 font-bold flex-shrink-0">{i + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-1"
                          >
                            <span className="truncate">{result.name}</span>
                            <ExternalLink className="size-2.5 flex-shrink-0 opacity-60" />
                          </a>
                          {result.snippet && (
                            <p className="text-muted-foreground mt-0.5 line-clamp-2">{result.snippet}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                            <span className="truncate">{result.host_name}</span>
                            {result.date && (
                              <>
                                <span>•</span>
                                <span>{result.date}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Streaming dots when content is empty */}
          {isUser ? (
            <div className="space-y-2">
              {/* File attachments display */}
              {parsedUserMessage && parsedUserMessage.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {parsedUserMessage.attachments.map((att, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950 dark:bg-blue-100 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-900 text-xs"
                    >
                      {att.type === 'image' && att.imageDataUrl ? (
                        <>
                          <div className="size-8 rounded overflow-hidden flex-shrink-0">
                            <img
                              src={att.imageDataUrl || undefined}
                              alt={att.name}
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{att.name}</p>
                            <p className="text-[10px] opacity-70">{att.size}</p>
                          </div>
                        </>
                      ) : att.type === 'image' ? (
                        <>
                          <ImageIcon className="size-4 text-blue-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{att.name}</p>
                            <p className="text-[10px] opacity-70">{att.size}</p>
                          </div>
                        </>
                      ) : att.type === 'pdf' ? (
                        <>
                          <FileText className="size-4 text-red-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{att.name}</p>
                            <p className="text-[10px] opacity-70">{att.size}</p>
                          </div>
                        </>
                      ) : att.type === 'text' ? (
                        <>
                          <FileText className="size-4 text-blue-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{att.name}</p>
                            <p className="text-[10px] opacity-70">{att.size}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <File className="size-4 text-blue-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{att.name}</p>
                            <p className="text-[10px] opacity-70">{att.size}</p>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Image previews from attachments */}
              {parsedUserMessage && parsedUserMessage.attachments.some((a) => a.type === 'image' && a.imageDataUrl) && (
                <div className="grid grid-cols-2 gap-2">
                  {parsedUserMessage.attachments
                    .filter((a) => a.type === 'image' && a.imageDataUrl)
                    .map((att, i) => (
                      <img
                        key={i}
                        src={att.imageDataUrl || undefined}
                        alt={att.name}
                        className="rounded-lg max-h-40 object-cover w-full max-w-full"
                        loading="lazy"
                      />
                    ))}
                </div>
              )}
              {/* User text */}
              {parsedUserMessage && parsedUserMessage.userText ? (
                <p className="whitespace-pre-wrap break-words">{parsedUserMessage.userText}</p>
              ) : !parsedUserMessage || parsedUserMessage.attachments.length === 0 ? (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              ) : null}
            </div>
          ) : message.content === '' && isStreaming ? (
            // V.46: Replace 3-dots with rich AI status indicator
            // Shows backendStatus if available, otherwise shows "بيفكّر..."
            // Also shows smartDocProgress if available
            <div className="py-2 space-y-2">
              {/* Smart Doc Progress */}
              {typeof window !== 'undefined' && (window as any).__smartDocProgress && (
                <div className="px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-3.5 text-emerald-600 dark:text-emerald-400 animate-spin" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {(window as any).__smartDocProgress.message || 'جاري المعالجة...'}
                    </span>
                    <span className="text-[10px] text-emerald-500 ml-auto">
                      {(window as any).__smartDocProgress.progress || 0}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900 overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(window as any).__smartDocProgress.progress || 0}%` }} />
                  </div>
                </div>
              )}
              {/* Backend status or thinking indicator */}
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
                <span className="relative flex size-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                </span>
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  {(message as any).backendStatus || '🤔 بيفكّر...'}
                </span>
                {(message as any).backendPhase && (
                  <span className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600 ml-auto">
                    {(message as any).backendPhase === 'thinking' ? 'تفكير' : (message as any).backendPhase === 'executing' ? 'تنفيذ' : 'كتابة'}
                  </span>
                )}
              </div>
              {/* File generation status */}
              {message.fileGenStatus === 'generating' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40">
                  <Loader2 className="size-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">📄 جاري إنشاء ملف PDF...</span>
                </div>
              )}
            </div>
          ) : isStreaming ? (
            // V.20: During streaming, render as plain text (fast) — no markdown parsing.
            // Markdown re-parsing on every chunk causes the "all text appears at once" bug.
            // Once streaming ends, the full content is rendered with ReactMarkdown below.
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.content}
              <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
            </div>
          ) : (
            <div className="markdown-content prose prose-sm dark:prose-invert max-w-none break-words overflow-x-auto">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeString = String(children).replace(/\n$/, '');
                    if (match) {
                      return <CodeBlock language={match[1]} code={codeString} />;
                    }
                    return (
                      <code
                        className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-2 last:mb-0">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="list-disc pr-4 mb-2 space-y-1">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="list-decimal pr-4 mb-2 space-y-1">{children}</ol>;
                  },
                  li({ children }) {
                    return <li className="mb-1">{children}</li>;
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-r-2 border-blue-500 pr-3 my-2 italic text-muted-foreground">
                        {children}
                      </blockquote>
                    );
                  },
                  h1({ children }) {
                    return <h1 className="text-lg font-bold mb-2 mt-3">{children}</h1>;
                  },
                  h2({ children }) {
                    return <h2 className="text-base font-bold mb-2 mt-3">{children}</h2>;
                  },
                  h3({ children }) {
                    return <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>;
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full border-collapse border border-border text-xs">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="border border-border px-2 py-1 bg-muted font-semibold text-right">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="border border-border px-2 py-1 text-right">
                        {children}
                      </td>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Inline Generated Images (from auto image generation in chat) */}
          {!isUser && message.generatedImages && message.generatedImages.length > 0 && (
            <div className="mt-3 space-y-3">
              {message.generatedImages.map((img, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl overflow-hidden border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-200 dark:bg-blue-800 shadow-sm"
                >
                  <img
                    src={img.dataUrl || undefined}
                    alt={img.prompt}
                    className="w-full max-h-96 object-contain bg-gray-50 dark:bg-blue-900"
                    loading="lazy"
                  />
                  <div className="px-3 py-2 flex items-center gap-2">
                    <ImageIcon className="size-3.5 text-blue-500 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground truncate">{img.prompt}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Backend Status Indicator — يظهر لما الـ AI بيشتغل */}
          {!isUser && (message as any).backendStatus && (
            <div className="mt-2 mb-1 flex items-center gap-2.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
              <span className="relative flex size-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
              </span>
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate">
                {(message as any).backendStatus}
              </span>
              {(message as any).backendPhase && (
                <span className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600 ml-auto">
                  {(message as any).backendPhase === 'thinking' ? 'تفكير' : (message as any).backendPhase === 'executing' ? 'تنفيذ' : 'كتابة'}
                </span>
              )}
            </div>
          )}

          {/* Image Generation Loading State */}
          {!isUser && message.imageGenStatus === 'generating' && (
            <div className="mt-3 flex items-center gap-3 p-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
              <div className="relative">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <ImageIcon className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">جاري توليد الصورة...</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400">هذا قد يستغرق بضع ثوان</p>
              </div>
            </div>
          )}

          {/* Image Generation Failed State */}
          {!isUser && message.imageGenStatus === 'failed' && (
            <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
              ⚠️ لم أتمكن من توليد الصورة. يمكنك استخدام /صورة للمحاولة مرة أخرى.
            </div>
          )}

          {/* Generated Video */}
          {!isUser && message.generatedVideo && (
            <div className="mt-3 rounded-xl overflow-hidden border border-border">
              <video
                src={message.generatedVideo.videoUrl || undefined}
                controls
                className="w-full max-w-lg rounded-xl"
                preload="metadata"
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}

          {/* Video Generation Status */}
          {!isUser && message.videoGenStatus === 'generating' && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl muted border border-border">
              <Loader2 className="size-4 animate-spin text-blue-500" />
              <span className="text-sm text-muted-foreground">جاري توليد الفيديو...</span>
            </div>
          )}

          {!isUser && message.videoGenStatus === 'failed' && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
              <XCircle className="size-4 text-red-500" />
              <span className="text-sm text-red-600 dark:text-red-400">فشل توليد الفيديو</span>
            </div>
          )}

          {/* File Generation Loading State */}
          {!isUser && message.fileGenStatus === 'generating' && (
            <div className="mt-3 flex items-center gap-3 p-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
              <div className="relative">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <FileText className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">📄 جاري إنشاء ملف PDF...</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400">يتم تجهيز الملف، قد يستغرق بضع ثوان</p>
              </div>
            </div>
          )}

          {/* File Generation Failed State */}
          {!isUser && message.fileGenStatus === 'failed' && (!message.generatedFiles || message.generatedFiles.length === 0) && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <XCircle className="size-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm text-blue-600 dark:text-blue-400">لم أتمكن من إنشاء الملف. يمكنك طلب إنشاء ملف PDF أو HTML بشكل صريح.</span>
            </div>
          )}

          {/* Generated Files Ready Card */}
          {!isUser && message.generatedFiles && message.generatedFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.generatedFiles.map((file, i) => (
                <motion.div
                  key={file.id || i}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut', delay: i * 0.1 }}
                  className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950 overflow-hidden"
                  dir="rtl"
                >
                  {/* Success header */}
                  <div className="px-4 py-2.5 border-b border-blue-200 dark:border-blue-800 flex items-center gap-2.5">
                    <div className="flex items-center justify-center size-7 rounded-full bg-blue-500 text-white">
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-blue-800 dark:text-blue-200 flex-1">
                      تم إنشاء الملف بنجاح! ✅
                    </p>
                  </div>

                  {/* File info */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex items-center justify-center size-10 rounded-lg bg-blue-50 dark:bg-blue-950 dark:bg-blue-200 dark:bg-blue-800 border border-blue-200 dark:border-blue-800 flex-shrink-0">
                      <FileText className={`size-6 ${file.name?.endsWith('.html') ? 'text-blue-500' : file.name?.endsWith('.txt') ? 'text-gray-500' : 'text-red-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" title={file.name}>{file.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${file.name?.endsWith('.html') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : file.name?.endsWith('.txt') ? 'bg-gray-100 dark:bg-blue-900 text-gray-700 dark:text-gray-300' : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'}`}>
                          {file.name?.endsWith('.html') ? 'HTML' : file.name?.endsWith('.txt') ? 'TXT' : 'PDF'}
                        </span>
                        {file.fileSize && file.fileSize > 0 && (
                          <span className="text-[11px] text-muted-foreground">{formatFileSize(file.fileSize)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <Button
                      onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                      size="sm"
                      className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <ExternalLink className="size-3.5" />
                      فتح الملف
                    </Button>
                    {file.name?.endsWith('.html') && (
                      <Button
                        onClick={() => {
                          // Open HTML in new window and trigger print-to-PDF
                          const printWin = window.open(file.url, '_blank', 'noopener,noreferrer');
                          if (printWin) {
                            printWin.onload = () => {
                              setTimeout(() => printWin.print(), 1000);
                            };
                          }
                        }}
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                        title="طباعة/حفظ كـ PDF من المتصفح"
                      >
                        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        PDF
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = file.url;
                        a.download = file.name;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }}
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                    >
                      <Download className="size-3.5" />
                      تحميل
                    </Button>
                    {file.driveLink && (
                      <Button
                        onClick={() => window.open(file.driveLink, '_blank', 'noopener,noreferrer')}
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                        title="فتح في Google Drive"
                      >
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.71 3.5L1.15 15l4.58 7.5L12.29 11 7.71 3.5zm1.14 0L19.41 3.5 12.86 15H1.72l5.13-11.5zm10.01 0L13.72 15l4.58 7.5 5.55-11.5-5-7.5z" />
                        </svg>
                        Drive
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Media Widget — inline audio/video player (radio, spotify, youtube, tts) */}
          {!isUser && message.mediaWidget && (
            <div className="mt-3">
              <AudioPlayer widget={message.mediaWidget} />
            </div>
          )}

          {/* Inline images detected from URLs */}
          {imageUrls.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {imageUrls.filter(url => url && url.trim()).map((url, i) => (
                <img
                  key={i}
                  src={url || undefined}
                  alt={`صورة ${i + 1}`}
                  className="rounded-lg max-h-40 object-cover w-full max-w-full"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>

        {/* Document Generation Progress Card (shown during generation in chat) */}
        {!isUser && isStreaming && documentGenProgress && (
          <div className="mt-2 mx-1">
            <DocumentProgressCard
              progress={documentGenProgress}
              onCancel={() => {
                // Signal cancellation to the store
                useChatStore.getState().clearDocumentGenState();
              }}
              startTime={useChatStore.getState().isGeneratingDocument ? undefined : undefined}
            />
          </div>
        )}

        {/* Document Ready Card (shown when document generation completes) */}
        {!isUser && !isStreaming && documentGenResult && (
          <div className="mt-2 mx-1">
            <DocumentReadyCard
              result={documentGenResult}
              onRegenerate={() => {
                // Clear the result to allow re-generation
                useChatStore.getState().clearDocumentGenState();
              }}
            />
          </div>
        )}

        {/* Inline Audio Player (when TTS is active) */}
        {!isUser && ttsState !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 muted rounded-lg px-3 py-2 mx-10"
          >
            {/* Play/Pause button */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
              onClick={handleTTS}
              aria-label={getTTSLabel()}
            >
              {getTTSIcon()}
            </Button>

            {/* Stop button */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full text-muted-foreground hover:text-foreground flex-shrink-0"
              onClick={handleStopTTS}
              aria-label="إيقاف"
            >
              <StopCircle className="size-3.5" />
            </Button>

            {/* Progress bar */}
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-100"
                style={{ width: `${audioProgress * 100}%` }}
              />
            </div>

            {/* Time display */}
            <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
              {audioDuration > 0
                ? `${formatAudioTime(audioProgress * audioDuration)} / ${formatAudioTime(audioDuration)}`
                : 'جاري التحميل...'
              }
            </span>
          </motion.div>
        )}

        {/* Timestamp + action buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: showTime ? 1 : 0.5 }}
          className={cn(
            'flex items-center gap-1 text-[10px] text-muted-foreground',
            isUser ? 'mr-10 justify-end' : 'ml-10'
          )}
        >
          <Clock className="size-3" />
          <span>{formatTime(message.createdAt)}</span>

          {/* Assistant message actions */}
          {!isUser && message.content && !isStreaming && (
            <>
              <button
                onClick={handleCopy}
                className="flex items-center gap-0.5 hover:text-foreground transition-colors min-h-[20px] px-1"
                aria-label={copied ? 'تم النسخ' : 'نسخ الرسالة'}
              >
                {copied ? (
                  <Check className="size-3 text-blue-500" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>

              <button
                onClick={handleTTS}
                className={cn(
                  'flex items-center gap-0.5 hover:text-foreground transition-colors min-h-[20px] px-1',
                  ttsState === 'loading' && 'pointer-events-none'
                )}
                aria-label={getTTSLabel()}
                disabled={ttsState === 'loading'}
              >
                {getTTSIcon()}
              </button>

              <button
                onClick={handleGeneratePDF}
                className={cn(
                  'flex items-center gap-0.5 hover:text-foreground transition-colors min-h-[20px] px-1',
                  isGeneratingPdf && 'pointer-events-none'
                )}
                aria-label={isGeneratingPdf ? 'جاري إنشاء PDF...' : 'إنشاء وتحميل PDF'}
                disabled={isGeneratingPdf}
              >
                {isGeneratingPdf ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FileText className="size-3" />
                )}
              </button>

              <button
                onClick={handleDownloadText}
                className="flex items-center gap-0.5 hover:text-foreground transition-colors min-h-[20px] px-1"
                aria-label="تحميل كنص"
              >
                <FileType className="size-3" />
              </button>
            </>
          )}
        </motion.div>
      </div>

      {/* Assistant avatar on the left in RTL */}
      {!isUser && model && (
        <div className="flex-shrink-0 mt-1">
          <div className="size-8 rounded-full bg-gradient-to-bl from-blue-600 to-blue-500 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500">
            {model.name.charAt(0)}
          </div>
        </div>
      )}
    </motion.div>
  );
}
