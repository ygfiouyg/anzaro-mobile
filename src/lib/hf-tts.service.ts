// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — HuggingFace MMS TTS Service
// ═══════════════════════════════════════════════════════════════════════
// Uses Meta's MMS (Massively Multilingual Speech) TTS models via
// HuggingFace Inference API for native Arabic text-to-speech.
//
// Models:
//   - facebook/mms-tts-arz: Egyptian Arabic (عامية مصرية)
//   - facebook/mms-tts-ara: Modern Standard Arabic (فصحى)
//
// IMPORTANT: This module is SERVER-SIDE ONLY. Do not import in client code.
// ═══════════════════════════════════════════════════════════════════════

import { HfInference } from '@huggingface/inference';
import { traceAPI, traceError } from '@/lib/trace-logger';

// ─── HF Inference Client ──────────────────────────────────────────
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_TOKEN || '';

const hf = new HfInference(HF_TOKEN || undefined);

// ─── MMS TTS Model IDs ───────────────────────────────────────────
const MMS_MODELS = {
  arz: 'facebook/mms-tts-arz', // Egyptian Arabic
  ara: 'facebook/mms-tts-ara', // Modern Standard Arabic
} as const;

export type MMSLanguage = keyof typeof MMS_MODELS;

// ─── Voice Metadata ──────────────────────────────────────────────
export interface MMSVoice {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  language: MMSLanguage;
  modelId: string;
  gender: 'male' | 'female';
  badge: string;
  dialect?: string;
  dialectAr?: string;
  provider?: string;
  preview?: string;
  badgeColor?: string;
}

export const VOICES: MMSVoice[] = [
  {
    id: 'hf-mms-shakir',
    name: 'Shakir',
    nameAr: 'شاكر',
    description: 'مصري أصيل (MMS)',
    language: 'arz',
    modelId: MMS_MODELS.arz,
    gender: 'male',
    badge: '🇪🇬🏆',
  },
  {
    id: 'hf-mms-fusha',
    name: 'Fusha',
    nameAr: 'فصحى',
    description: 'عربي فصحى (MMS)',
    language: 'ara',
    modelId: MMS_MODELS.ara,
    gender: 'male',
    badge: '📖',
  },
  // NOTE: Meta's MMS TTS only provides male Arabic voices.
  // There are no female Arabic MMS models available on HuggingFace.
  // To add a female voice, a third-party TTS provider would be needed
  // (e.g., ElevenLabs, Google Cloud TTS, or Azure Speech).
];

// ✅ Voice selection verification (Fix A — #2, #3):
// The VOICES array contains both Egyptian (arz) and Fusha (ara) voices.
// generateMMSAudioAuto() correctly maps voiceId → language → model:
//   'hf-mms-shakir' → arz → facebook/mms-tts-arz (Egyptian)
//   'hf-mms-fusha'  → ara → facebook/mms-tts-ara  (MSA/Fusha)
// If voiceId doesn't match any known voice, auto-detection defaults to 'ara' (MSA).
// The voice-chat route passes voiceId to generateMMSAudioAuto() — selection works end-to-end.

// ─── Detect if text is Arabic ────────────────────────────────────
function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

// ─── Auto-detect language from text ──────────────────────────────
// Egyptian Arabic tends to use specific words and patterns
const EGYPTIAN_MARKERS = [
  'ازيك', 'عامل ايه', 'إزيك', 'عامل إيه',
  'النهاردة', 'بكرة', 'امبارح', 'ده', 'دي',
  'كده', 'كده', 'يا باشا', 'يا معلم',
  'مش', 'مفيش', 'ليه', 'جداً',
  'اللي', 'بتاع', 'بتاعت', 'عشان',
];

function detectLanguage(text: string): MMSLanguage {
  const lower = text.toLowerCase();
  // Check for Egyptian Arabic markers
  const egyptianScore = EGYPTIAN_MARKERS.filter(m => lower.includes(m)).length;
  // If we find Egyptian markers, use arz; otherwise default to fusha (MSA)
  if (egyptianScore > 0) return 'arz';
  return 'ara'; // Default to MSA (Modern Standard Arabic) — more universally understood
}

// ─── Generate MMS TTS Audio ──────────────────────────────────────
/**
 * Generate speech audio using Meta's MMS TTS model via HuggingFace Inference API.
 *
 * @param text - The text to synthesize (Arabic text recommended)
 * @param lang - Language code: 'arz' for Egyptian Arabic, 'ara' for MSA
 * @returns Buffer containing WAV audio data
 */
export async function generateMMSAudio(
  text: string,
  lang: MMSLanguage = 'arz'
): Promise<Buffer> {
  const modelId = MMS_MODELS[lang];

  traceAPI(`[HF-MMS-TTS] Generating audio: model=${modelId}, text=${text.slice(0, 50)}...`);

  try {
    // Use the HfInference textToSpeech method
    // This calls POST https://router.huggingface.co/hf-inference/models/{model}
    const audioBuffer = await hf.textToSpeech({
      model: modelId,
      inputs: text,
    }, {
      // wait_for_model: true allows cold model loading (may take 20-60s on first call)
      wait_for_model: true,
    } as any);

    // audioBuffer is an ArrayBuffer, convert to Buffer
    const buffer = Buffer.from(audioBuffer as unknown as ArrayBuffer);

    if (buffer.length <= 100) {
      throw new Error(`HF MMS TTS returned empty audio (${buffer.length} bytes)`);
    }

    traceAPI(`[HF-MMS-TTS] Success: ${buffer.length} bytes, model=${modelId}`);
    return buffer;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    traceError(`[HF-MMS-TTS] Error: ${errMsg.slice(0, 150)}`);
    throw error;
  }
}

/**
 * Generate speech with automatic language detection.
 * Detects Egyptian Arabic vs MSA based on text content.
 */
export async function generateMMSAudioAuto(text: string, preferredVoice?: string): Promise<Buffer> {
  // If a specific voice ID is provided, find its language
  if (preferredVoice) {
    const voice = VOICES.find(v => v.id === preferredVoice);
    if (voice) {
      return generateMMSAudio(text, voice.language);
    }
  }

  if (!isArabicText(text)) {
    // Non-Arabic text — use fusha model as it handles loanwords better
    return generateMMSAudio(text, 'ara');
  }
  const lang = detectLanguage(text);
  return generateMMSAudio(text, lang);
}

/**
 * Get the model ID for a given language code.
 */
export function getModelId(lang: MMSLanguage): string {
  return MMS_MODELS[lang];
}

/**
 * Check if HF token is available.
 */
export function hasHFToken(): boolean {
  return !!HF_TOKEN;
}
