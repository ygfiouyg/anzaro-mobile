'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceOutputState {
  speaking: boolean;
  speak: (text: string, token?: string) => void;
  stop: () => void;
}

/**
 * useVoiceOutput — speaks Arabic text via Web Speech API (browser native)
 * Falls back gracefully if SpeechSynthesis unavailable.
 * Token kept for API-based TTS future use.
 */
export function useVoiceOutput(): VoiceOutputState {
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  const stop = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, _token?: string) => {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
      if (!synth) {
        console.warn('[voice] SpeechSynthesis not available');
        return;
      }
      // Strip markdown/HTML for cleaner speech
      const clean = text
        .replace(/```[\s\S]*?```/g, ' كود ')
        .replace(/[#*_`~]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();

      if (!clean) return;

      try {
        synth.cancel(); // stop any ongoing speech
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'ar-EG';
        u.rate = 0.95;
        u.pitch = 1;
        u.volume = 1;

        // Try to pick an Arabic voice
        const voices = synth.getVoices();
        const arVoice =
          voices.find((v) => v.lang.startsWith('ar')) ||
          voices.find((v) => v.lang.includes('AR'));
        if (arVoice) u.voice = arVoice;

        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);

        utterRef.current = u;
        synth.speak(u);
      } catch (e) {
        console.error('[voice] speak failed', e);
        setSpeaking(false);
      }
    },
    []
  );

  return { speaking, speak, stop };
}
