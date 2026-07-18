'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, Volume2, Loader2, PhoneOff, User, Zap, Wifi, Play, Square, ChevronDown, ChevronUp, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';
import { useTheme } from 'next-themes';

// ─── Voice Chat State Machine ────────────────────────────────
// idle: waiting for user to start
// listening: recording with VAD, auto-detects silence
// processing: ASR → AI race → TTS (pipelined)
// speaking: playing TTS audio (can be interrupted)
type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

// ─── Voice Chat Message ──────────────────────────────────────
interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ─── Voice Catalog — Edge TTS ONLY (Phase 5 isolated to single provider) ──
export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  provider: 'edge'; // Edge TTS is the ONLY provider
  voiceId: string;   // Microsoft Edge TTS voice ID (e.g. 'ar-EG-ShakirNeural')
  gender: 'male' | 'female';
  badge?: string;
}

const VOICE_CATALOG: VoiceOption[] = [
  // Egyptian Arabic (default, most natural for Egyptian users)
  { id: 'edge-shakir', name: 'شاكر', description: 'مصري ذكر', provider: 'edge', voiceId: 'ar-EG-ShakirNeural', gender: 'male', badge: '🇪🇬' },
  { id: 'edge-salma', name: 'سلمى', description: 'مصرية أنثى', provider: 'edge', voiceId: 'ar-EG-SalmaNeural', gender: 'female', badge: '🇪🇬' },

  // Saudi Arabic
  { id: 'edge-hamed', name: 'حامد', description: 'سعودي ذكر', provider: 'edge', voiceId: 'ar-SA-HamedNeural', gender: 'male', badge: '🇸🇦' },
  { id: 'edge-zariyah', name: 'زاريه', description: 'سعودية أنثى', provider: 'edge', voiceId: 'ar-SA-ZariyahNeural', gender: 'female', badge: '🇸🇦' },

  // Emirati Arabic
  { id: 'edge-hamdan', name: 'حمدان', description: 'إماراتي ذكر', provider: 'edge', voiceId: 'ar-AE-HamdanNeural', gender: 'male', badge: '🇦🇪' },
  { id: 'edge-fatima', name: 'فاطمة', description: 'إماراتية أنثى', provider: 'edge', voiceId: 'ar-AE-FatimaNeural', gender: 'female', badge: '🇦🇪' },

  // Lebanese Arabic
  { id: 'edge-rami', name: 'رامي', description: 'لبناني ذكر', provider: 'edge', voiceId: 'ar-LB-RamiNeural', gender: 'male', badge: '🇱🇧' },
  { id: 'edge-layla', name: 'ليلى', description: 'لبنانية أنثى', provider: 'edge', voiceId: 'ar-LB-LaylaNeural', gender: 'female', badge: '🇱🇧' },

  // Iraqi Arabic
  { id: 'edge-bassel', name: 'باسل', description: 'عراقي ذكر', provider: 'edge', voiceId: 'ar-IQ-BasselNeural', gender: 'male', badge: '🇮🇶' },
  { id: 'edge-rana', name: 'رانا', description: 'عراقية أنثى', provider: 'edge', voiceId: 'ar-IQ-RanaNeural', gender: 'female', badge: '🇮🇶' },

  // Moroccan Arabic
  { id: 'edge-jamal', name: 'جمال', description: 'مغربي ذكر', provider: 'edge', voiceId: 'ar-MA-JamalNeural', gender: 'male', badge: '🇲🇦' },
  { id: 'edge-mouna', name: 'منى', description: 'مغربية أنثى', provider: 'edge', voiceId: 'ar-MA-MounaNeural', gender: 'female', badge: '🇲🇦' },

  // English voices (for bilingual users)
  { id: 'edge-aria', name: 'Aria', description: 'English Female (US)', provider: 'edge', voiceId: 'en-US-AriaNeural', gender: 'female', badge: '🇺🇸' },
  { id: 'edge-guy', name: 'Guy', description: 'English Male (US)', provider: 'edge', voiceId: 'en-US-GuyNeural', gender: 'male', badge: '🇺🇸' },
];

// Preview sample text for each voice
const PREVIEW_TEXT = 'مرحبا! أنا بعقل، مساعدك الذكي. ازيك النهاردة؟';

interface VoiceChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── VAD (Voice Activity Detection) ──────────────────────────
const VAD_SILENCE_MS = 1200;
const VAD_VOLUME_THRESHOLD = 0.015;
const VAD_SPEAKING_THRESHOLD = 0.025;

// ─── Audio Visualizer Bar Heights ────────────────────────────
const VISUALIZER_BARS = 28;
const VISUALIZER_HEIGHTS = Array.from({ length: VISUALIZER_BARS }, (_, i) => {
  // Create a natural wave pattern
  const center = VISUALIZER_BARS / 2;
  const dist = Math.abs(i - center) / center;
  return Math.max(0.2, 1 - dist * 0.7);
});

export function VoiceChatOverlay({ isOpen, onClose }: VoiceChatOverlayProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  const [provider, setProvider] = useState<string>('');

  // Theme
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Voice picker state
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICE_CATALOG[0]); // Default: شاكر (Edge Egyptian)
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [failedVoiceIds, setFailedVoiceIds] = useState<Set<string>>(new Set());
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // VAD refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceStartRef = useRef<number>(0);
  const hasDetectedSpeechRef = useRef(false);
  const processingStartTimeRef = useRef<number>(0);

  // TTS Audio Queue refs
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortedRef = useRef(false);

  // Abort controller for cancelling AI requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-continuous mode
  const [autoContinue, setAutoContinue] = useState(true);
  const autoContinueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activeModel, activeLanguage, sendMessage } = useChatStore();

  // ─── Stop preview audio ─────────────────────────────────────
  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current = null;
      } catch { /* ignore */ }
    }
    setPreviewingVoiceId(null);
  }, []);

  // ─── Play voice preview ─────────────────────────────────────
  // Uses /api/ai/tts/edge — Edge TTS is the single provider
  const playVoicePreview = useCallback(async (voice: VoiceOption) => {
    // Stop any current preview
    stopPreview();

    // Clear failed state for this voice (allow retry)
    setFailedVoiceIds(prev => {
      const next = new Set(prev);
      next.delete(voice.id);
      return next;
    });

    setLoadingVoiceId(voice.id);
    setPreviewingVoiceId(null);

    try {
      const response = await fetch('/api/ai/tts/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          voice: voice.voiceId, // Direct Edge TTS voice ID (e.g. 'ar-EG-ShakirNeural')
          speed: 1.0,
        }),
      });

      if (!response.ok) {
        console.warn(`[VoicePreview] ${voice.name} failed: ${response.status}`);
        setFailedVoiceIds(prev => new Set(prev).add(voice.id));
        setLoadingVoiceId(null);
        return;
      }

      // Parse as ArrayBuffer → wrap in Blob with explicit audio/wav type
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength <= 100) {
        console.warn(`[VoicePreview] ${voice.name} returned empty audio (${arrayBuffer.byteLength} bytes)`);
        setFailedVoiceIds(prev => new Set(prev).add(voice.id));
        setLoadingVoiceId(null);
        return;
      }

      const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });

      setLoadingVoiceId(null);
      setPreviewingVoiceId(voice.id);

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        previewAudioRef.current = null;
        setPreviewingVoiceId(null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        previewAudioRef.current = null;
        setPreviewingVoiceId(null);
      };

      await audio.play();
    } catch (err) {
      console.warn(`[VoicePreview] Error previewing ${voice.name}:`, err);
      setFailedVoiceIds(prev => new Set(prev).add(voice.id));
      setLoadingVoiceId(null);
    }
  }, [stopPreview]);

  // ─── Stop all audio playback ────────────────────────────────
  const stopAllAudio = useCallback(() => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      } catch { /* ignore */ }
    }
    for (const url of audioQueueRef.current) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // ─── Play next audio in queue ───────────────────────────────
  // FIX: use a ref so the callback can self-reference without a
  // "cannot access variable before declaration" error.
  const playNextInQueueRef = useRef<(() => void) | null>(null);
  const playNextInQueue = useCallback(() => {
    if (abortedRef.current) return;
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setVoiceState(prev => {
        if (prev === 'speaking') return 'idle';
        return prev;
      });
      return;
    }

    const url = audioQueueRef.current.shift()!;
    isPlayingRef.current = true;

    const audio = new Audio(url);
    currentAudioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      playNextInQueueRef.current?.();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      playNextInQueueRef.current?.();
    };

    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      isPlayingRef.current = false;
    });
  }, []);
  useEffect(() => {
    playNextInQueueRef.current = playNextInQueue;
  }, [playNextInQueue]);

  // ─── Helper: add audio blob to queue and start playback ──────
  const enqueueAudioBlob = useCallback((audioBlob: Blob) => {
    if (audioBlob.size <= 100) return false;
    const audioUrl = URL.createObjectURL(audioBlob);
    audioQueueRef.current.push(audioUrl);

    if (processingStartTimeRef.current && !isPlayingRef.current) {
      const elapsed = Date.now() - processingStartTimeRef.current;
      setLatency(elapsed);
    }

    if (!isPlayingRef.current) {
      playNextInQueue();
    }
    return true;
  }, [playNextInQueue]);

  // ─── Queue TTS audio for a sentence ─────────────────────────
  // Uses /api/ai/tts/edge — Edge TTS is the single provider, no fallbacks
  const queueTTSSentence = useCallback(async (text: string) => {
    if (!text.trim() || abortedRef.current) return;

    try {
      const response = await fetch('/api/ai/tts/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 10000),
          voice: selectedVoice.voiceId, // Direct Edge TTS voice ID
          speed: 1.1,
        }),
      });

      if (!response.ok) {
        console.warn(`[VoiceChat] TTS failed: ${response.status}`);
        return;
      }

      // Parse as ArrayBuffer → wrap in Blob with explicit audio/wav type
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength <= 100) {
        console.warn(`[VoiceChat] TTS returned empty audio (${arrayBuffer.byteLength} bytes)`);
        return;
      }

      const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
      enqueueAudioBlob(audioBlob);
    } catch (err) {
      console.error('[VoiceChat] TTS error:', err);
    }
  }, [selectedVoice, enqueueAudioBlob]);

  // ─── VAD: Stop monitoring ───────────────────────────────────
  const stopVAD = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
  }, []);

  // ─── Stop recording ─────────────────────────────────────────
  const stopRecording = useCallback(() => {
    stopVAD();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }
  }, [stopVAD]);

  // Session ID for voice chat
  const sessionIdRef = useRef<string>(`vs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

  // ─── Send to AI (non-streaming, fast race) ──────────────────
  const sendToAI = useCallback(async (transcript: string) => {
    if (abortedRef.current) return;

    setVoiceState('processing');
    setAiResponse('');
    setError('');
    setProvider('');
    processingStartTimeRef.current = Date.now();

    const userMsg: VoiceMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: transcript,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Timeout: if no response after 15 seconds, give up
    const processingTimeout = setTimeout(() => {
      if (!abortedRef.current) {
        setError('الرد اتأخر كتير، حاول تاني');
        setVoiceState('idle');
      }
    }, 15_000);

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcript,
          sessionId: sessionIdRef.current,
          model: 'glm-5-2',
          language: activeLanguage,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`خطأ في الاتصال (${response.status})`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const text = data.content || '';
      const usedProvider = data.provider || 'unknown';
      const elapsed = data.elapsed || 0;

      if (!text.trim()) {
        throw new Error('لم أتمكن من معالجة طلبك');
      }

      // Show the full response immediately
      setAiResponse(text);
      setProvider(usedProvider);
      setVoiceState('speaking');

      // Send to TTS — split by sentences for faster audio delivery
      const sentences = text.match(/[^.!?؟。\n؛]+[.!?؟。\n؛]*/g) || [text];
      for (const sentence of sentences) {
        if (sentence.trim().length > 1) {
          queueTTSSentence(sentence.trim());
        }
      }

      // Add assistant message
      const assistantMsg: VoiceMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Also send to main chat store
      try { sendMessage(transcript); } catch { /* non-critical */ }

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[VoiceChat] AI error:', err);
      setError(err.message || 'حصل خطأ، حاول تاني');
      setVoiceState('idle');
    } finally {
      clearTimeout(processingTimeout);
    }
  }, [activeLanguage, sendMessage, queueTTSSentence]);

  // ─── Process recorded audio (ASR) ───────────────────────────
  const processRecording = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000 || abortedRef.current) {
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');
    setCurrentTranscript('');

    try {
      const token = useAuthStore.getState().token;
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', 'ar');

      const asrResponse = await fetch('/api/ai/asr', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!asrResponse.ok) {
        let errMsg = 'فشل في تحويل الصوت';
        try {
          const errData = await asrResponse.json();
          errMsg = errData.error || errMsg;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const data = await asrResponse.json();
      const transcript = data.text || '';

      if (!transcript.trim()) {
        setVoiceState('idle');
        return;
      }

      setCurrentTranscript(transcript);
      await sendToAI(transcript);

    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('[VoiceChat] ASR error:', err);
      setError(err.message || 'فشل في تحويل الصوت إلى نص');
      setVoiceState('idle');
    }
  }, [sendToAI]);

  // ─── Start recording with VAD ───────────────────────────────
  const startListening = useCallback(async () => {
    try {
      setError('');
      setVoiceState('listening');
      audioChunksRef.current = [];
      hasDetectedSpeechRef.current = false;
      silenceStartRef.current = 0;
      abortedRef.current = false;
      // Close voice picker if open
      setShowVoicePicker(false);
      stopPreview();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      // ── Set up VAD ──
      try {
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Float32Array(analyser.fftSize);
        let speakingFrames = 0;

        vadIntervalRef.current = setInterval(() => {
          if (abortedRef.current) return;
          analyser.getFloatTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const now = Date.now();

          if (rms > VAD_SPEAKING_THRESHOLD) {
            speakingFrames++;
            if (speakingFrames > 3) hasDetectedSpeechRef.current = true;
            silenceStartRef.current = 0;
          } else if (rms < VAD_VOLUME_THRESHOLD && hasDetectedSpeechRef.current) {
            if (silenceStartRef.current === 0) {
              silenceStartRef.current = now;
            } else if (now - silenceStartRef.current > VAD_SILENCE_MS) {
              console.log('[VoiceChat VAD] Silence detected, auto-stopping');
              stopRecording();
            }
          } else {
            silenceStartRef.current = 0;
          }
        }, 100);
      } catch (vadErr) {
        console.warn('[VoiceChat] VAD setup failed, using manual mode:', vadErr);
      }

      // ── Set up MediaRecorder ──
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        stopVAD();
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processRecording(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

    } catch (err) {
      console.error('[VoiceChat] Mic access error:', err);
      setError('لا يمكن الوصول إلى الميكروفون. تأكد من السماح بالوصول.');
      setVoiceState('idle');
    }
  }, [stopRecording, stopVAD, processRecording, stopPreview]);

  // ─── Toggle recording ──────────────────────────────────────
  const toggleRecording = useCallback(() => {
    if (voiceState === 'idle') {
      startListening();
    } else if (voiceState === 'listening') {
      stopRecording();
    } else if (voiceState === 'speaking') {
      abortedRef.current = false;
      stopAllAudio();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setVoiceState('idle');
      setTimeout(() => startListening(), 150);
    }
  }, [voiceState, startListening, stopRecording, stopAllAudio]);

  // ─── Auto-continue: after speaking, auto-start listening ────
  useEffect(() => {
    if (voiceState === 'idle' && autoContinue && messages.length > 0 && isOpen) {
      autoContinueTimeoutRef.current = setTimeout(() => {
        if (!abortedRef.current) {
          startListening();
        }
      }, 600);
    }
    return () => {
      if (autoContinueTimeoutRef.current) {
        clearTimeout(autoContinueTimeoutRef.current);
      }
    };
  }, [voiceState, autoContinue, messages.length, isOpen, startListening]);

  // ─── Close overlay ─────────────────────────────────────────
  const handleClose = useCallback(() => {
    abortedRef.current = true;
    stopRecording();
    stopAllAudio();
    stopPreview();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (autoContinueTimeoutRef.current) {
      clearTimeout(autoContinueTimeoutRef.current);
    }
    setVoiceState('idle');
    setMessages([]);
    setCurrentTranscript('');
    setAiResponse('');
    setError('');
    setLatency(null);
    setProvider('');
    setShowVoicePicker(false);
    onClose();
  }, [onClose, stopRecording, stopAllAudio, stopPreview]);

  // ─── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      abortedRef.current = true;
      stopRecording();
      stopAllAudio();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (autoContinueTimeoutRef.current) {
        clearTimeout(autoContinueTimeoutRef.current);
      }
    };
  }, [stopRecording, stopAllAudio]);

  // ─── Provider badge color ──────────────────────────────────
  const getProviderColor = (prov: string) => {
    switch (prov) {
      case 'Cerebras': return 'text-blue-400';
      case 'OpenRouter': return 'text-blue-400';
      default: return 'text-muted-foreground';
    }
  };

  // ─── Voice provider display name ───────────────────────────
  const getProviderLabel = (prov: string) => {
    switch (prov) {
      case 'edge': return 'Edge';
      default: return prov;
    }
  };

  // ─── State label config ────────────────────────────────────
  const stateConfig = {
    idle: { label: 'جاهز', sublabel: 'اضغط للتحدث', color: 'text-blue-400', glow: 'shadow-blue-500' },
    listening: { label: 'سمعك...', sublabel: 'اتكلم... هيقف لو سكتت', color: 'text-blue-400', glow: 'shadow-blue-500' },
    processing: { label: 'بيفكر...', sublabel: 'بيجهز الرد', color: 'text-blue-400', glow: 'shadow-blue-500' },
    speaking: { label: 'بيقول...', sublabel: 'اضغط عشان تقاطعه', color: 'text-blue-400', glow: 'shadow-blue-500' },
  };

  const currentConfig = stateConfig[voiceState];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background"
          style={isDark ? {
            background: 'linear-gradient(180deg, #030712 0%, #0a1628 35%, #0c1a2e 50%, #0a1628 65%, #030712 100%)',
          } : undefined}
          dir="rtl"
        >
          {/* ─── Animated Aurora/Nebula Background (dark mode only) ──── */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden hidden dark:block">
            {/* Aurora layer 1 */}
            <motion.div
              animate={{
                x: [0, 30, -20, 0],
                y: [0, -20, 10, 0],
                scale: [1, 1.1, 0.95, 1],
              }}
              transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] opacity-[0.07]"
              style={{
                background: 'radial-gradient(ellipse at 30% 50%, #10b981 0%, transparent 60%), radial-gradient(ellipse at 70% 30%, #14b8a6 0%, transparent 50%)',
                filter: 'blur(80px)',
              }}
            />
            {/* Aurora layer 2 */}
            <motion.div
              animate={{
                x: [0, -25, 15, 0],
                y: [0, 15, -25, 0],
                scale: [1, 0.95, 1.1, 1],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-1/4 -right-1/4 w-[150%] h-[150%] opacity-[0.05]"
              style={{
                background: 'radial-gradient(ellipse at 60% 70%, #0d9488 0%, transparent 55%), radial-gradient(ellipse at 20% 80%, #059669 0%, transparent 50%)',
                filter: 'blur(100px)',
              }}
            />
            {/* Aurora layer 3 - subtle warm accent */}
            <motion.div
              animate={{
                x: [0, 20, -30, 0],
                y: [0, -30, 20, 0],
              }}
              transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-0 left-0 w-full h-full opacity-[0.03]"
              style={{
                background: 'radial-gradient(ellipse at 80% 20%, #8b5cf6 0%, transparent 40%), radial-gradient(ellipse at 10% 90%, #06b6d4 0%, transparent 40%)',
                filter: 'blur(60px)',
              }}
            />
            {/* Noise texture overlay */}
            <div
              className="absolute inset-0 opacity-[0.015]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              }}
            />
          </div>

          {/* ─── Header ────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="relative z-20 flex items-center justify-between px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500">
                <span className="text-white text-sm">🌊</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground tracking-wide">Anzaro AI Voice</span>
                <div className="flex items-center gap-2 mt-0.5">
                  {latency && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500 border border-blue-500 text-[10px] text-blue-400 font-mono"
                    >
                      <Zap className="size-2.5" />
                      {latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(1)}s`}
                    </motion.span>
                  )}
                  {provider && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted border border-border text-[10px] font-mono', getProviderColor(provider))}
                    >
                      <Wifi className="size-2.5" />
                      {provider}
                    </motion.span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoContinue(!autoContinue)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all duration-300',
                  autoContinue
                    ? 'bg-blue-500 text-blue-400 border border-blue-500 shadow-sm shadow-blue-500'
                    : 'bg-muted text-muted-foreground border border-border'
                )}
              >
                <Zap className="size-3" />
                تلقائي
              </button>
              <motion.button
                onClick={handleClose}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2.5 rounded-xl bg-muted hover:bg-accent border border-border transition-colors text-muted-foreground hover:text-foreground"
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </motion.button>
            </div>
          </motion.div>

          {/* ─── Messages Area ────────────────────────────────── */}
          <div className="relative z-10 flex-1 overflow-y-auto px-5 py-2 space-y-3 min-h-0 custom-scrollbar">
            {/* Empty state */}
            {messages.length === 0 && voiceState === 'idle' && !currentTranscript && !aiResponse && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.5, type: 'spring' }}
                  className="mb-6"
                >
                  {/* Glowing orb */}
                  <div className="relative mx-auto mb-6">
                    <div className="size-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-500 border border-blue-500 flex items-center justify-center mx-auto">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        className="size-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-500 flex items-center justify-center"
                      >
                        <Mic className="size-7 text-blue-400" />
                      </motion.div>
                    </div>
                    {/* Subtle glow ring */}
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 rounded-full border border-blue-500"
                    />
                  </div>

                  <h3 className="text-2xl font-bold text-foreground mb-3">تحدث مع <span className="bg-gradient-to-l from-blue-400 to-blue-400 bg-clip-text text-transparent">Anzaro AI</span> 🇪🇬</h3>
                  <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                    اضغط على الزر وابدأ التحدث. هيرد عليك بالصوت بسرعة!
                  </p>
                </motion.div>
              </div>
            )}

            {/* Current user transcript */}
            {currentTranscript && (
              <motion.div
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="flex justify-start"
              >
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-500 border border-blue-500 px-4 py-3 shadow-lg shadow-blue-500">
                  <p className="text-[10px] text-blue-400 font-bold mb-1 tracking-wide">أنت</p>
                  <p className="text-sm text-foreground leading-relaxed">{currentTranscript}</p>
                </div>
              </motion.div>
            )}

            {/* AI response */}
            {aiResponse && (
              <motion.div
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="flex justify-end"
              >
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted border border-border px-4 py-3 shadow-lg shadow-black dark:shadow-black">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] text-blue-400 font-bold tracking-wide">Anzaro AI</span>
                    <span className="text-[9px] text-muted-foreground">·</span>
                    <span className="text-[9px] text-muted-foreground">{selectedVoice.name}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
                </div>
              </motion.div>
            )}

            {/* Processing indicator */}
            {voiceState === 'processing' && !aiResponse && (
              <motion.div
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                className="flex justify-end"
              >
                <div className="rounded-2xl rounded-tl-sm bg-muted border border-border px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                        className="size-1.5 rounded-full bg-blue-400"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                        className="size-1.5 rounded-full bg-blue-400"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                        className="size-1.5 rounded-full bg-blue-400"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">بيجهز الرد...</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Previous messages (faded) */}
            {messages.slice(0, -2).map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                className={cn('flex', msg.role === 'user' ? 'justify-start' : 'justify-end')}
              >
                <div className={cn(
                  'max-w-[75%] rounded-xl px-3 py-1.5 text-xs text-muted-foreground ',
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-blue-500 border border-blue-500'
                    : 'rounded-tl-sm bg-muted border border-border'
                )}>
                  {msg.content.slice(0, 100)}{msg.content.length > 100 ? '...' : ''}
                </div>
              </motion.div>
            ))}

            {/* Error message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex justify-center"
              >
                <div className="rounded-xl bg-red-500 border border-red-500 px-4 py-2.5">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* ─── Central Voice Control Area ─────────────────────── */}
          <div className="relative z-10 flex flex-col items-center pb-6 pt-2 px-4">
            {/* Status label with animated dot */}
            <motion.div
              key={voiceState}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="flex items-center gap-2 mb-5"
            >
              <motion.div
                animate={{
                  scale: voiceState === 'idle' ? [1, 1.3, 1] : 1,
                  opacity: voiceState === 'idle' ? [0.5, 1, 0.5] : 1,
                }}
                transition={{ duration: 2, repeat: voiceState === 'idle' ? Infinity : 0, ease: 'easeInOut' }}
                className={cn(
                  'size-2 rounded-full',
                  voiceState === 'idle' && 'bg-blue-400',
                  voiceState === 'listening' && 'bg-blue-400',
                  voiceState === 'processing' && 'bg-blue-400',
                  voiceState === 'speaking' && 'bg-blue-400',
                )}
              />
              <span className={cn('text-sm font-bold tracking-wide', currentConfig.color)}>
                {currentConfig.label}
              </span>
              {voiceState !== 'idle' && (
                <span className="text-[11px] text-muted-foreground mr-1">{currentConfig.sublabel}</span>
              )}
            </motion.div>

            {/* ─── Audio Visualizer (horizontal bars) ────────────── */}
            {(voiceState === 'listening' || voiceState === 'speaking') && (
              <div className="flex items-center justify-center gap-[3px] h-12 mb-4 w-full max-w-xs">
                {VISUALIZER_HEIGHTS.map((heightFactor, i) => (
                  <motion.div
                    key={i}
                    className={cn(
                      'w-[4px] rounded-full origin-bottom',
                      voiceState === 'listening'
                        ? 'bg-gradient-to-t from-blue-500 to-blue-400'
                        : 'bg-gradient-to-t from-blue-500 to-blue-400',
                    )}
                    animate={{
                      height: voiceState === 'listening'
                        ? [
                            `${heightFactor * 8}px`,
                            `${heightFactor * (20 + Math.random() * 20)}px`,
                            `${heightFactor * (10 + Math.random() * 15)}px`,
                            `${heightFactor * (25 + Math.random() * 15)}px`,
                            `${heightFactor * 8}px`,
                          ]
                        : [
                            `${heightFactor * 6}px`,
                            `${heightFactor * (15 + Math.random() * 25)}px`,
                            `${heightFactor * (20 + Math.random() * 20)}px`,
                            `${heightFactor * (8 + Math.random() * 12)}px`,
                            `${heightFactor * 6}px`,
                          ],
                    }}
                    transition={{
                      duration: 0.6 + Math.random() * 0.4,
                      repeat: Infinity,
                      repeatType: 'reverse',
                      ease: 'easeInOut',
                      delay: i * 0.03,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Idle state subtle visualizer placeholder */}
            {voiceState === 'idle' && (
              <div className="flex items-center justify-center gap-[3px] h-6 mb-4 w-full max-w-xs">
                {VISUALIZER_HEIGHTS.map((_, i) => (
                  <div
                    key={i}
                    className="w-[4px] rounded-full bg-blue-500"
                    style={{ height: `${3 + Math.sin(i * 0.5) * 2}px` }}
                  />
                ))}
              </div>
            )}

            {/* Processing state: pulsing wave */}
            {voiceState === 'processing' && (
              <div className="flex items-center justify-center gap-[3px] h-10 mb-4 w-full max-w-xs">
                {VISUALIZER_HEIGHTS.map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-[4px] rounded-full bg-gradient-to-t from-blue-500 to-blue-400"
                    animate={{
                      height: ['4px', `${12 + Math.sin(i * 0.4) * 8}px`, '4px'],
                      opacity: [0.3, 0.8, 0.3],
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: i * 0.05,
                    }}
                  />
                ))}
              </div>
            )}

            {/* ─── Mic Button ──────────────────────────────────── */}
            <div className="relative flex items-center justify-center">
              {/* Outer breathing ring (idle) */}
              {voiceState === 'idle' && (
                <motion.div
                  animate={{
                    scale: [1, 1.15, 1],
                    opacity: [0.15, 0.05, 0.15],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute size-36 rounded-full border-2 border-blue-500"
                />
              )}

              {/* Ripple rings (listening) */}
              <AnimatePresence>
                {voiceState === 'listening' && (
                  <>
                    <motion.div
                      initial={{ scale: 1, opacity: 0.3 }}
                      animate={{ scale: 2.5, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                      className="absolute rounded-full border-2 border-blue-400 size-24"
                    />
                    <motion.div
                      initial={{ scale: 1, opacity: 0.25 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                      className="absolute rounded-full border-2 border-blue-400 size-24"
                    />
                    <motion.div
                      initial={{ scale: 1, opacity: 0.2 }}
                      animate={{ scale: 1.7, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.8 }}
                      className="absolute rounded-full border-2 border-blue-400 size-24"
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Spinning gradient ring (processing) */}
              <AnimatePresence>
                {voiceState === 'processing' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, rotate: 360 }}
                    exit={{ opacity: 0 }}
                    transition={{ rotate: { duration: 2, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.3 } }}
                    className="absolute size-28 rounded-full"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent, #14b8a6, transparent, #0d9488, transparent)',
                      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))',
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Speaking glow rings */}
              <AnimatePresence>
                {voiceState === 'speaking' && (
                  <>
                    <motion.div
                      initial={{ scale: 1, opacity: 0.2 }}
                      animate={{ scale: 1.8, opacity: 0 }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                      className="absolute rounded-full bg-blue-500 size-24"
                    />
                    <motion.div
                      initial={{ scale: 1, opacity: 0.15 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
                      className="absolute rounded-full bg-blue-500 size-24"
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Main Mic Button */}
              <motion.button
                onClick={toggleRecording}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: voiceState === 'processing' ? 1 : 1.05 }}
                disabled={voiceState === 'processing'}
                className={cn(
                  'relative z-10 size-24 rounded-full flex items-center justify-center transition-all duration-500',
                  voiceState === 'idle' && 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-2xl shadow-blue-500 hover:shadow-blue-500',
                  voiceState === 'listening' && 'bg-gradient-to-br from-blue-500 to-red-600 text-white shadow-2xl shadow-blue-500',
                  voiceState === 'processing' && 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-2xl shadow-blue-500 cursor-wait',
                  voiceState === 'speaking' && 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-2xl shadow-blue-500 hover:shadow-blue-500',
                )}
                aria-label="Toggle voice chat"
              >
                {/* Inner glow */}
                <div className={cn(
                  'absolute inset-0 rounded-full opacity-20',
                  voiceState === 'idle' && 'bg-gradient-to-br from-white to-transparent',
                  voiceState === 'listening' && 'bg-gradient-to-br from-white to-transparent',
                  voiceState === 'processing' && 'bg-gradient-to-br from-white to-transparent',
                  voiceState === 'speaking' && 'bg-gradient-to-br from-white to-transparent',
                )} />

                {voiceState === 'idle' && (
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Mic className="size-10" />
                  </motion.div>
                )}
                {voiceState === 'listening' && <MicOff className="size-10" />}
                {voiceState === 'processing' && (
                  <Loader2 className="size-10 animate-spin" />
                )}
                {voiceState === 'speaking' && <Volume2 className="size-10" />}
              </motion.button>
            </div>

            {/* ─── Sublabel & Controls below button ──────────────── */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-[11px] text-muted-foreground mt-4 text-center"
            >
              {voiceState === 'idle' && 'اضغط واتكلم — هيسمعك ويرد تلقائي'}
              {voiceState === 'listening' && 'VAD يعمل تلقائياً'}
              {voiceState === 'processing' && 'بيجهز الرد بأسرع مزود...'}
              {voiceState === 'speaking' && 'اضغط عشان تقاطعه'}
            </motion.p>

            {/* Voice picker toggle & end call button */}
            <div className="flex items-center gap-3 mt-4">
              {/* Voice selector pill */}
              <button
                onClick={() => {
                  if (voiceState === 'idle') {
                    setShowVoicePicker(!showVoicePicker);
                  }
                }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300',
                  voiceState === 'idle'
                    ? 'bg-muted border border-border hover:bg-accent cursor-pointer'
                    : 'bg-muted border border-border cursor-default'
                )}
              >
                <Headphones className="size-3.5 text-blue-400" />
                <span className="text-[11px] text-foreground font-medium">{selectedVoice.name}</span>
                {selectedVoice.badge && <span className="text-[10px]">{selectedVoice.badge}</span>}
                <span className="text-[9px] text-muted-foreground">{getProviderLabel(selectedVoice.provider)}</span>
                {voiceState === 'idle' && (
                  showVoicePicker
                    ? <ChevronUp className="size-3 text-muted-foreground" />
                    : <ChevronDown className="size-3 text-muted-foreground" />
                )}
              </button>

              {/* End call button */}
              <motion.button
                onClick={handleClose}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-red-500 border border-border hover:border-red-500 text-muted-foreground hover:text-red-400 transition-all duration-300 text-[11px]"
              >
                <PhoneOff className="size-3.5" />
                <span>إنهاء</span>
              </motion.button>
            </div>
          </div>

          {/* ─── Voice Picker Bottom Sheet ──────────────────────── */}
          <AnimatePresence>
            {showVoicePicker && voiceState === 'idle' && (
              <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 z-30 max-h-[70vh] flex flex-col"
              >
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/40 "
                  onClick={() => setShowVoicePicker(false)}
                />

                {/* Sheet content */}
                <div className="relative mx-3 mb-3 rounded-2xl popover border border-border overflow-hidden shadow-2xl shadow-black dark:shadow-black">
                  {/* Handle bar */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-muted-foreground" />
                  </div>

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2">
                    <h4 className="text-sm font-bold text-foreground">اختر صوت</h4>
                    <span className="text-[10px] text-muted-foreground">اضغط ▶ لسماع</span>
                  </div>

                  {/* Voice list */}
                  <div className="max-h-80 overflow-y-auto px-3 pb-3 space-y-1.5 custom-scrollbar">
                    {VOICE_CATALOG.map((voice) => {
                      const isFailed = failedVoiceIds.has(voice.id);
                      const isPreviewing = previewingVoiceId === voice.id;
                      const isLoading = loadingVoiceId === voice.id;
                      return (
                        <motion.div
                          key={voice.id}
                          whileHover={{ scale: isFailed ? 1 : 1.01 }}
                          whileTap={{ scale: isFailed ? 1 : 0.98 }}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer',
                            isFailed
                              ? 'opacity-40 border border-transparent'
                              : selectedVoice.id === voice.id
                                ? 'bg-blue-500 border border-blue-500 shadow-sm shadow-blue-500'
                                : 'bg-muted border border-border hover:bg-accent hover:border-border'
                          )}
                          onClick={() => {
                            if (!isFailed) {
                              setSelectedVoice(voice);
                            } else {
                              playVoicePreview(voice);
                            }
                          }}
                        >
                          {/* Gender icon */}
                          <div className={cn(
                            'size-8 rounded-full flex items-center justify-center text-[11px] shrink-0',
                            isFailed
                              ? 'bg-red-500 text-red-400'
                              : voice.gender === 'male'
                                ? 'bg-blue-500 text-blue-400'
                                : 'bg-blue-500 text-blue-400'
                          )}>
                            <User className="size-3.5" />
                          </div>

                          {/* Voice info */}
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                'text-xs font-bold',
                                isFailed ? 'text-red-400' :
                                selectedVoice.id === voice.id ? 'text-blue-400' : 'text-foreground'
                              )}>
                                {voice.name}
                              </span>
                              {voice.badge && (
                                <span className="text-[10px]">{voice.badge}</span>
                              )}
                              {selectedVoice.id === voice.id && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500 text-blue-400 font-medium">مختار</span>
                              )}
                              {isFailed && (
                                <span className="text-[9px] text-red-400">اضغط لإعادة</span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {voice.description} · {getProviderLabel(voice.provider)}
                            </span>
                          </div>

                          {/* Preview button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPreviewing || isLoading) {
                                stopPreview();
                              } else {
                                playVoicePreview(voice);
                              }
                            }}
                            className={cn(
                              'size-8 rounded-full flex items-center justify-center transition-all shrink-0',
                              isPreviewing
                                ? 'bg-blue-500 text-white scale-110 shadow-lg shadow-blue-500'
                                : isLoading
                                  ? 'bg-muted-foreground text-foreground animate-pulse'
                                  : isFailed
                                    ? 'bg-red-500 text-red-400 hover:bg-red-500'
                                    : 'bg-muted text-muted-foreground hover:bg-blue-500 hover:text-blue-400'
                            )}
                            aria-label={isFailed ? `أعد تجربة صوت ${voice.name}` : `استمع لصوت ${voice.name}`}
                          >
                            {isLoading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : isPreviewing ? (
                              <Square className="size-3.5" fill="currentColor" />
                            ) : (
                              <Play className="size-3.5" fill="currentColor" />
                            )}
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
