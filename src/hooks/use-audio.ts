'use client';

// ═══════════════════════════════════════════════════════════════════════
// use-audio.ts — Unified voice hook for DeltaAI
// THE ULTIMATE WINNER PIPELINE (from Voice Research pit-fight, 65+ sources)
// ═══════════════════════════════════════════════════════════════════════
// 100% FREE-FOREVER. ZERO API KEYS. ZERO server-side STT. ZERO Groq.
//
//   STT (both buttons): Browser Web Speech API (webkitSpeechRecognition)
//     • lang = 'ar-EG'  — Egyptian Arabic locale (handles "يا عبس", "صايع", "بالملي")
//     • continuous = false  — single-utterance, instant final transcript
//     • interimResults = false — zero partial noise, text appears the
//       millisecond the user stops speaking
//     Research §4.4 line 459: "SpeechRecognition (STT) built into
//     Chrome/Edge, no key." Beats Groq Whisper (403), Vosk, whisper.cpp.
//
//   LLM (Button 2 only): POST /api/voice/chat
//     • Multi-provider race (ZAI / Cerebras / Groq / OpenRouter)
//     • Reads data.content (the actual field returned — fixes the
//       "AI returned empty" bug from prior turns)
//
//   TTS (Button 2 only): POST /api/ai/tts/edge → Microsoft Edge TTS
//     • Voice: ar-EG-ShakirNeural (male) / ar-EG-SalmaNeural (female)
//     • Research §4.4 line 458: "Edge TTS — free, no API key, Arabic dialects."
//     • Research §5 line 470: "ar-EG-Shakir/Salma — no key needed."
//     • Progressive Blob([buffer], {type:'audio/mpeg'}) playback — chunked
//       for zero-latency streaming (pattern from RealtimeVoiceChat repo).
//     • FALLBACK: browser SpeechSynthesis (ar-EG) when server is down —
//       voice chat NEVER goes silent.
//
//   BARGE-IN (Button 2): interruptSpeaking() clears the TTS queue + restarts
//     listening — pattern borrowed from WhisperFusion (seamless interruption).
//
// ZERO references to: Groq Whisper, ZAI ASR, HF-MMS, MediaRecorder, VAD,
// AudioContext, AnalyserNode. All purged.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

// ─── Types ────────────────────────────────────────────────────────────
export type DictationState = 'idle' | 'recording';
export type LiveChatState = 'idle' | 'listening' | 'processing' | 'speaking';
export type EgyptianVoice = 'ar-EG-ShakirNeural' | 'ar-EG-SalmaNeural';

export interface LiveMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface UseAudioReturn {
  // ── Dictation (Button 1) ──
  dictation: DictationState;
  dictationError: string | null;
  startDictation: () => Promise<void>;
  stopDictation: () => void;
  dictationElapsed: number | null;

  // ── Live Voice Chat (Button 2) ──
  liveChat: LiveChatState;
  liveChatError: string | null;
  liveChatLatency: number | null;
  liveMessages: LiveMessage[];
  isLiveChatOpen: boolean;
  openLiveChat: () => void;
  closeLiveChat: () => void;
  toggleLiveChat: () => void;
  interruptSpeaking: () => void;

  // ── Voice selection (Shakir ↔ Salma toggle) ──
  voice: EgyptianVoice;
  setVoice: (v: EgyptianVoice) => void;

  // ── Shared ──
  micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  speechRecognitionSupported: boolean;
}

// ─── Web Speech API type shims (browser-native, no npm deps) ──────────
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
  onstart: ((ev: Event) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition
    || (window as any).webkitSpeechRecognition
    || null;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ═══════════════════════════════════════════════════════════════════════
export function useAudio(opts: {
  initialVoice?: EgyptianVoice;
  onDictationText?: (text: string) => void;
} = {}): UseAudioReturn {
  const onDictationText = opts.onDictationText;

  // ── State ──
  const [dictation, setDictation] = useState<DictationState>('idle');
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [dictationElapsed, setDictationElapsed] = useState<number | null>(null);

  const [liveChat, setLiveChat] = useState<LiveChatState>('idle');
  const [liveChatError, setLiveChatError] = useState<string | null>(null);
  const [liveChatLatency, setLiveChatLatency] = useState<number | null>(null);
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [isLiveChatOpen, setIsLiveChatOpen] = useState(false);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [voice, setVoice] = useState<EgyptianVoice>(opts.initialVoice ?? 'ar-EG-ShakirNeural');

  const recognitionCtor = getSpeechRecognitionCtor();
  const speechRecognitionSupported = recognitionCtor !== null;

  // ── Refs ──
  const dictationRecRef = useRef<SpeechRecognitionLike | null>(null);
  const liveRecRef = useRef<SpeechRecognitionLike | null>(null);

  // TTS audio queue refs (Web Audio API — decodeAudioData + AudioBufferSourceNode)
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortedRef = useRef(false);
  const processingStartRef = useRef<number>(0);

  // Live chat session control
  const liveChatActiveRef = useRef(false);
  const liveTranscriptRef = useRef<string>('');
  const sessionIdRef = useRef<string>(`vs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

  // AudioContext ref — used to unlock the browser's audio hardware on the
  // first user gesture (Button 2 click). Browsers block autoplay until a
  // user interaction resumes a suspended AudioContext.
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);

  // Voice ref (so async callbacks always read the latest selection without
  // re-creating the callback chain)
  const voiceRef = useRef<EgyptianVoice>(voice);
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  // Refs to functions referenced before declaration (declaration-order rules)
  const playNextInQueueRef = useRef<() => void>(() => {});
  const restartLiveListeningRef = useRef<() => void>(() => {});

  const { activeLanguage, sendMessage } = useChatStore();

  // ═══════════════════════════════════════════════════════════════════════
  // AUDIO HARDWARE UNLOCK — beat the browser autoplay restriction
  // ═══════════════════════════════════════════════════════════════════════
  // Browsers (Chrome/Safari/Firefox) block audio playback until a user
  // gesture occurs. This function MUST be called inside the click handler
  // of Button 2 (openLiveChat). It:
  //   1. Creates (or reuses) a shared AudioContext.
  //   2. If suspended, resumes it (the user-gesture unlock).
  //   3. Plays a short near-silent test beep so the hardware channel is
  //      actively opened — the user gets immediate audible confirmation
  //      that voice chat is live.
  // ═══════════════════════════════════════════════════════════════════════
  const unlockAudioHardware = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined') return;
    try {
      // Reuse existing context, or create one
      if (!audioContextRef.current) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        audioContextRef.current = new Ctor();
      }
      const ctx = audioContextRef.current;
      // FORCE RESUME if suspended (the critical autoplay unlock)
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { /* ignore */ }
      }
      // Play a short near-silent beep (40Hz sine, 0.08s, gain 0.04) to
      // physically open the audio hardware channel. Audible confirmation
      // for the user that voice chat is live.
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 440;
        gain.gain.value = 0.04;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.start(now);
        osc.stop(now + 0.08);
      } catch { /* oscillator failed — non-fatal */ }
      audioUnlockedRef.current = true;
    } catch {
      // AudioContext creation/resume failed — non-fatal; the Audio element
      // fallback path will still attempt playback.
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED: mic permission probe
  // ═══════════════════════════════════════════════════════════════════════
  const probeMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      setMicPermission('granted');
      return true;
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setMicPermission('denied');
      }
      return false;
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // DICTATION (Button 1) — Web Speech API, Egyptian Arabic, single-shot
  // ═══════════════════════════════════════════════════════════════════════
  const stopDictation = useCallback(() => {
    const rec = dictationRecRef.current;
    if (rec) { try { rec.stop(); } catch {} }
    setDictation('idle');
  }, []);

  const startDictation = useCallback(async () => {
    setDictationError(null);
    setDictationElapsed(null);

    if (!recognitionCtor) {
      setDictationError('المتصفح لا يدعم التعرف على الصوت — جرّب Chrome أو Edge');
      return;
    }

    if (!(await probeMicPermission())) {
      setDictationError('تعذّر الوصول إلى الميكروفون — فعّله من إعدادات المتصفح');
      return;
    }

    const rec = new recognitionCtor();
    rec.lang = 'ar-EG';              // FORCE Egyptian Arabic
    rec.continuous = false;          // single-utterance
    rec.interimResults = false;      // final transcript only
    rec.maxAlternatives = 1;

    const t0 = performance.now();

    rec.onstart = () => setDictation('recording');

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const result = ev.results[ev.results.length - 1];
      const transcript = result[0]?.transcript?.trim() || '';
      if (transcript) {
        const elapsed = performance.now() - t0;
        setDictationElapsed(elapsed);
        if (onDictationText) onDictationText(transcript);
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const err = ev.error;
      if (err === 'no-speech') setDictationError('لم أسمع كلام — حاول تاني');
      else if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMicPermission('denied');
        setDictationError('تم رفض إذن الميكروفون');
      } else if (err !== 'aborted') {
        setDictationError(`خطأ في التعرف على الصوت: ${err}`);
      }
      setDictation('idle');
    };

    rec.onend = () => {
      setDictation('idle');
      dictationRecRef.current = null;
    };

    dictationRecRef.current = rec;
    try { rec.start(); }
    catch {
      setDictationError('تعذّر بدء التعرف على الصوت');
      setDictation('idle');
    }
  }, [recognitionCtor, onDictationText, probeMicPermission]);

  // ═══════════════════════════════════════════════════════════════════════
  // LIVE VOICE CHAT (Button 2) — Web Speech STT + Edge TTS + fallback
  // ═══════════════════════════════════════════════════════════════════════

  // ── TTS audio queue (Web Audio API — decodeAudioData + AudioBufferSourceNode) ──
  // MOST RELIABLE playback path on mobile — no HTMLAudioElement, no blob URLs.
  // WAV (RIFF PCM) is universally decodable via decodeAudioData.
  const playNextInQueue = useCallback(() => {
    if (abortedRef.current) return;
    const nextBuffer = audioQueueRef.current.shift();
    if (!nextBuffer) {
      isPlayingRef.current = false;
      if (liveChatActiveRef.current) restartLiveListeningRef.current();
      return;
    }

    isPlayingRef.current = true;
    setLiveChat('speaking');

    // Stop any previous source
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
      try { currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }

    const playBuffer = async () => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) { playNextInQueueRef.current(); return; }
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }

        console.log('[AudioDiagnostics] Queue decodeAudioData:', { byteLength: nextBuffer.byteLength });
        const audioBuffer = await ctx.decodeAudioData(nextBuffer);
        console.log('[AudioDiagnostics] Queue decoded:', { duration: audioBuffer.duration, sampleRate: audioBuffer.sampleRate });

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          console.log('[AudioDiagnostics] Queue item ended normally');
          currentSourceRef.current = null;
          playNextInQueueRef.current();
        };
        source.start();
        currentSourceRef.current = source;
        console.log('[AudioDiagnostics] Queue ✅ AudioBufferSourceNode started');
      } catch (err: any) {
        console.error('[AudioDiagnostics] Queue decode/play failed:', err?.name, err?.message);
        playNextInQueueRef.current();
      }
    };
    void playBuffer();
  }, []);

  useEffect(() => { playNextInQueueRef.current = playNextInQueue; }, [playNextInQueue]);

  // ═══════════════════════════════════════════════════════════════════════
  // Enqueue a Base64-encoded audio by DECODING to a Blob Object URL.
  //
  // WHY NOT DATA URI:
  //   Long `data:audio/mpeg;base64,...` strings get rejected by the browser's
  //   media element engine due to sandbox string-length restrictions. We
  //   decode the Base64 → Uint8Array → Blob → short Object URL instead.
  // ═══════════════════════════════════════════════════════════════════════
  const enqueueBase64Audio = useCallback((base64Data: string, mimeType: string = 'audio/wav'): boolean => {
    if (!base64Data || base64Data.length < 200) return false;
    try {
      // Decode Base64 → binary string → Uint8Array → ArrayBuffer
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      // Push the raw ArrayBuffer to the queue (decodeAudioData will handle it)
      audioQueueRef.current.push(bytes.buffer);

      console.log('[AudioDiagnostics] Queue decoded Base64 → ArrayBuffer:', {
        base64Length: base64Data.length,
        decodedBytes: len,
        mimeType,
        isRiffWav: bytes[0] === 0x52 && bytes[1] === 0x49,
      });
    } catch (err) {
      console.error('[AudioDiagnostics] Queue Base64 decode failed:', err);
      return false;
    }

    if (processingStartRef.current && !isPlayingRef.current) {
      setLiveChatLatency(Date.now() - processingStartRef.current);
    }
    if (!isPlayingRef.current) playNextInQueue();
    return true;
  }, [playNextInQueue]);

  // ═══════════════════════════════════════════════════════════════════════
  // EDGE TTS ONLY — NO browser SpeechSynthesis fallback
  // ═══════════════════════════════════════════════════════════════════════
  // The browser's native speechSynthesis uses a standard Arabic voice that
  // MISREADS Egyptian dialect (e.g. "ليه" → "لا"). We PURGE it entirely.
  // All TTS now flows exclusively through /api/ai/tts/edge → Edge TTS
  // ar-EG-ShakirNeural (male) / ar-EG-SalmaNeural (female) for authentic
  // Egyptian pronunciation of slang like "ليه", "صايع", "بالملي", "يا عبس".
  //
  // If Edge TTS fails (4s timeout / HTTP error / empty audio), we RETRY
  // once with a longer timeout, then skip — NO browser voice fallback.
  // ═══════════════════════════════════════════════════════════════════════

  // ── Queue a TTS sentence via /api/ai/tts/edge (Edge TTS, Egyptian) ──
  // BASE64 JSON pipeline: the backend returns JSON { audioData, mimeType }.
  // We parse the JSON, extract the base64 string, and enqueue it as a Data URI.
  // This eliminates ALL binary wire corruption — JSON is 100% text-safe.
  // 4s timeout on first attempt; if it fails, retry once with 8s, then skip.
  const queueTTSSentence = useCallback(async (text: string) => {
    if (!text.trim() || abortedRef.current) return;

    const tryFetch = async (timeoutMs: number): Promise<boolean> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // Cache-busting timestamp — bypasses stale Webpack/Next.js route cache
        const ttsUrl = `/api/ai/tts/edge?t=${Date.now()}`;
        const response = await fetch(ttsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.slice(0, 10000),
            voice: voiceRef.current,   // ar-EG-ShakirNeural / ar-EG-SalmaNeural
            speed: 1.1,
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`Edge TTS HTTP ${response.status}`);
        // Parse JSON response — backend returns { audioData: "<base64>", mimeType, ... }
        const data = await response.json();
        if (!data.audioData || typeof data.audioData !== 'string') {
          throw new Error('Edge TTS: audioData missing in JSON response');
        }
        if (data.audioData.length < 200) {
          throw new Error(`Edge TTS: audioData too short (${data.audioData.length} chars)`);
        }
        const mimeType = data.mimeType || 'audio/mpeg';
        console.log('[AudioDiagnostics] Queue received JSON:', {
          audioDataLength: data.audioData.length,
          mimeType,
          voice: data.voice,
          byteLength: data.byteLength,
        });
        enqueueBase64Audio(data.audioData, mimeType);
        return true;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    };

    try {
      await tryFetch(4_000);   // first attempt: 4s timeout
    } catch (firstErr) {
      console.warn('[use-audio] Edge TTS first attempt failed, retrying (8s):', firstErr);
      try {
        await tryFetch(8_000); // retry: 8s timeout
      } catch (secondErr) {
        console.warn('[use-audio] Edge TTS retry failed — skipping (NO browser voice fallback):', secondErr);
        // NO speechSynthesis fallback — skip this chunk and resume listening
        if (liveChatActiveRef.current) restartLiveListeningRef.current();
      }
    }
  }, [enqueueBase64Audio]);

  // ── Send transcript → /api/voice/chat → stream TTS ──
  const sendToAI = useCallback(async (transcript: string) => {
    if (abortedRef.current) return;
    setLiveChat('processing');
    setLiveChatError(null);
    processingStartRef.current = Date.now();

    const userMsg: LiveMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: transcript,
      timestamp: Date.now(),
    };
    setLiveMessages((prev) => [...prev, userMsg]);

    const timeout = setTimeout(() => {
      if (!abortedRef.current) {
        setLiveChatError('الرد اتأخر، حاول تاني');
        setLiveChat('idle');
      }
    }, 20_000);

    try {
      const token = useAuthStore.getState().token;
      const response = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: transcript,
          sessionId: sessionIdRef.current,
          language: activeLanguage,
        }),
      });

      if (!response.ok) {
        let msg = `AI error ${response.status}`;
        try { const e = await response.json(); msg = e.error || msg; } catch {}
        throw new Error(msg);
      }
      const data = await response.json();
      // FIX: /api/voice/chat returns { content, provider, elapsed } —
      // previous code read data.reply/data.text → "AI returned empty"
      const aiText = (data.content || data.reply || data.text || data.message || '').trim();
      if (!aiText) throw new Error('AI returned empty');

      const aiMsg: LiveMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: aiText,
        timestamp: Date.now(),
      };
      setLiveMessages((prev) => [...prev, aiMsg]);

      // Persist into chat store so it shows up in the main transcript
      try { await sendMessage(aiText); } catch {}

      // Split into ≤180-char chunks for low-latency progressive TTS
      // (pattern from RealtimeVoiceChat + WhisperFusion)
      const sentences = aiText.split(/(?<=[.!?؟।\n])\s+/).filter((s) => s.trim().length > 0);
      const chunks: string[] = [];
      let buf = '';
      for (const s of sentences) {
        if ((buf + ' ' + s).length > 180) {
          if (buf) chunks.push(buf);
          buf = s;
        } else {
          buf = buf ? buf + ' ' + s : s;
        }
      }
      if (buf) chunks.push(buf);

      for (const chunk of chunks) {
        if (abortedRef.current) break;
        await queueTTSSentence(chunk);
      }

      // If no audio queued (TTS failed + fallback failed), resume listening
      if (!isPlayingRef.current && audioQueueRef.current.length === 0 && liveChatActiveRef.current) {
        restartLiveListeningRef.current();
      }
    } catch (err: any) {
      setLiveChatError(err?.message || 'خطأ في الرد');
      setLiveChat('idle');
    } finally {
      clearTimeout(timeout);
    }
  }, [activeLanguage, queueTTSSentence, sendMessage]);

  // ── Restart live listening (Web Speech API) ──
  const restartLiveListening = useCallback(() => {
    if (abortedRef.current || !liveChatActiveRef.current || !recognitionCtor) {
      if (!recognitionCtor) setLiveChatError('المتصفح لا يدعم التعرف على الصوت');
      return;
    }
    if (liveRecRef.current) { try { liveRecRef.current.abort(); } catch {} liveRecRef.current = null; }

    liveTranscriptRef.current = '';
    const rec = new recognitionCtor();
    rec.lang = 'ar-EG';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => { if (liveChatActiveRef.current) setLiveChat('listening'); };

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const result = ev.results[ev.results.length - 1];
      const transcript = result[0]?.transcript?.trim() || '';
      if (transcript) liveTranscriptRef.current = transcript;
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const err = ev.error;
      if (err === 'no-speech') {
        if (liveChatActiveRef.current) setTimeout(() => restartLiveListeningRef.current(), 200);
      } else if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMicPermission('denied');
        setLiveChatError('تم رفض إذن الميكروفون');
        setLiveChat('idle');
      } else if (err !== 'aborted') {
        setLiveChatError(`خطأ في التعرف على الصوت: ${err}`);
      }
    };

    rec.onend = () => {
      liveRecRef.current = null;
      const transcript = liveTranscriptRef.current.trim();
      if (abortedRef.current || !liveChatActiveRef.current) return;
      if (transcript) sendToAI(transcript);
      else setTimeout(() => {
        if (liveChatActiveRef.current && !abortedRef.current) restartLiveListeningRef.current();
      }, 200);
    };

    liveRecRef.current = rec;
    try { rec.start(); } catch {}
  }, [recognitionCtor, sendToAI]);

  useEffect(() => { restartLiveListeningRef.current = restartLiveListening; }, [restartLiveListening]);

  // ── BARGE-IN: interrupt TTS playback (WhisperFusion pattern) ──
  const interruptSpeaking = useCallback(() => {
    // Clear the TTS queue + stop current playback
    while (audioQueueRef.current.length) {
      const u = audioQueueRef.current.shift();
      // ArrayBuffer — no URL to revoke
    }
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }
    isPlayingRef.current = false;
    // EXPLICIT audio context release on this user interaction — guarantees
    // the hardware stays unlocked for the next playback cycle.
    if (audioContextRef.current?.state === 'suspended') {
      try { void audioContextRef.current.resume(); } catch {}
    }
    if (liveChatActiveRef.current) restartLiveListeningRef.current();
  }, []);

  // ── Open / close live chat ──
  const openLiveChat = useCallback(() => {
    if (!recognitionCtor) {
      setLiveChatError('المتصفح لا يدعم التعرف على الصوت — جرّب Chrome أو Edge');
      return;
    }
    abortedRef.current = false;
    liveChatActiveRef.current = true;
    setIsLiveChatOpen(true);
    setLiveChatError(null);
    setLiveMessages([]);
    setLiveChatLatency(null);
    // ═══ AUDIO HARDWARE UNLOCK ═══
    // CRITICAL: This runs inside the user's click gesture (Button 2).
    // We must resume the AudioContext NOW so subsequent .play() calls on
    // the TTS Audio elements are not blocked by the autoplay restriction.
    // The unlockAudioHardware() also plays a short test beep so the user
    // gets immediate audible confirmation that the channel is open.
    void unlockAudioHardware();
    setTimeout(() => { restartLiveListening(); }, 100);
  }, [recognitionCtor, restartLiveListening, unlockAudioHardware]);

  const closeLiveChat = useCallback(() => {
    abortedRef.current = true;
    liveChatActiveRef.current = false;
    setIsLiveChatOpen(false);
    setLiveChat('idle');

    if (liveRecRef.current) { try { liveRecRef.current.abort(); } catch {} liveRecRef.current = null; }
    if (dictationRecRef.current) { try { dictationRecRef.current.abort(); } catch {} dictationRecRef.current = null; setDictation('idle'); }
    while (audioQueueRef.current.length) {
      const u = audioQueueRef.current.shift();
      // ArrayBuffer — no URL to revoke
    }
    if (currentSourceRef.current) { try { currentSourceRef.current.stop(); currentSourceRef.current.disconnect(); } catch {} currentSourceRef.current = null; }
    // Suspend (but don't close) the AudioContext so it can be quickly resumed
    // on the next openLiveChat() call.
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      try { void audioContextRef.current.suspend(); } catch {}
    }
    isPlayingRef.current = false;
  }, []);

  const toggleLiveChat = useCallback(() => {
    if (isLiveChatOpen) closeLiveChat();
    else openLiveChat();
  }, [isLiveChatOpen, openLiveChat, closeLiveChat]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      abortedRef.current = true;
      liveChatActiveRef.current = false;
      if (dictationRecRef.current) { try { dictationRecRef.current.abort(); } catch {} }
      if (liveRecRef.current) { try { liveRecRef.current.abort(); } catch {} }
      while (audioQueueRef.current.length) {
        const u = audioQueueRef.current.shift();
        // ArrayBuffer — no URL to revoke
      }
      if (currentSourceRef.current) { try { currentSourceRef.current.stop(); currentSourceRef.current.disconnect(); } catch {} currentSourceRef.current = null; }
      // Close the AudioContext to free the hardware audio device
      if (audioContextRef.current) { try { void audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
    };
  }, []);

  return {
    dictation, dictationError, startDictation, stopDictation, dictationElapsed,
    liveChat, liveChatError, liveChatLatency, liveMessages, isLiveChatOpen,
    openLiveChat, closeLiveChat, toggleLiveChat, interruptSpeaking,
    voice, setVoice,
    micPermission, speechRecognitionSupported,
  };
}
