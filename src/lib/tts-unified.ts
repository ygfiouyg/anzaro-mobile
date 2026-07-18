// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Unified TTS Facade
// ═══════════════════════════════════════════════════════════════════════
// A single entry point for all Text-to-Speech generation with automatic
// fallback across providers. New code should use `generateSpeech()` and
// `generateSpeechWithProvider()` instead of calling individual services.
//
// Fallback chain: Edge TTS → Google TTS → Gradio TTS → HF TTS
//
// Existing individual service files are NOT deleted — they can still be
// used directly by existing routes. Routes can be migrated incrementally.
//
// NOTE: This module is SERVER-SIDE ONLY. Do not import in client code.
// ═══════════════════════════════════════════════════════════════════════

import { synthesizeSpeech as edgeSynthesize, ARABIC_VOICES as EDGE_ARABIC_VOICES, EGYPTIAN_VOICES as EDGE_EGYPTIAN_VOICES } from '@/lib/edge-tts';
import { googleTTS, GOOGLE_TTS_VOICES, isArabicText as googleIsArabicText } from '@/lib/google-tts';
import { generateGradioArabicTTS, isGradioTTSAvailable, checkGradioTTSHealth } from '@/lib/gradio-tts.service';
import { generateMMSAudio, generateMMSAudioAuto, VOICES as HF_VOICES, hasHFToken, MMSLanguage } from '@/lib/hf-tts.service';

// ─── Public Types ─────────────────────────────────────────────────────

/** The providers supported by the unified TTS facade. */
export type TTSProvider = 'edge' | 'google' | 'gradio' | 'hf';

/** Audio format returned by each provider. */
export type TTSAudioFormat = 'audio/mpeg' | 'audio/wav';

/** The consistent result returned by all TTS operations. */
export interface TTSResult {
  /** Raw audio bytes. */
  audioBuffer: Buffer;
  /** MIME type of the audio (e.g. 'audio/mpeg', 'audio/wav'). */
  format: TTSAudioFormat;
  /** Which provider actually generated the audio. */
  provider: TTSProvider;
  /** Approximate audio duration in seconds, if known. */
  duration?: number;
}

/** Voice metadata for listing / selection. */
export interface TTSVoiceInfo {
  /** Unique voice identifier (e.g. 'ar-EG-ShakirNeural', 'google-ar-eg-male'). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Which provider owns this voice. */
  provider: TTSProvider;
  /** Language / locale code. */
  locale: string;
  /** Voice gender if known. */
  gender?: 'male' | 'female';
  /** Audio format this voice produces. */
  format: TTSAudioFormat;
}

/** Options for the unified `generateSpeech()` function. */
export interface TTSOptions {
  /** The text to synthesize. Required. */
  text: string;
  /**
   * Voice identifier. Each provider maps this to its own voice.
   * If omitted, a sensible default is chosen based on `language`.
   *
   * Accepts:
   *  - Edge voice names (e.g. 'ar-EG-ShakirNeural')
   *  - Google voice IDs (e.g. 'google-ar-eg-male')
   *  - HF MMS voice IDs (e.g. 'hf-mms-shakir')
   *  - Shortcut keys (e.g. 'egyptian-male', 'female')
   */
  voice?: string;
  /**
   * Language code (e.g. 'ar', 'en', 'ar-EG').
   * Defaults to auto-detection based on text content.
   */
  language?: string;
  /**
   * Speech speed multiplier: 0.5 (slow) to 2.0 (fast). Default 1.0.
   * Not all providers support this — unsupported ones silently ignore it.
   */
  speed?: number;
  /**
   * Force a specific provider instead of using the fallback chain.
   * If this provider fails, no fallback is attempted.
   */
  preferredProvider?: TTSProvider;
  /**
   * Override the default fallback chain.
   * Default: ['edge', 'google', 'gradio', 'hf']
   */
  fallbackChain?: TTSProvider[];
}

/** Health status for a single provider. */
export interface TTSProviderHealth {
  provider: TTSProvider;
  available: boolean;
  latencyMs?: number;
  error?: string;
}

// ─── Internal Provider Adapters ───────────────────────────────────────

interface ProviderAdapter {
  name: TTSProvider;
  /** Attempt to generate speech. Throws on failure. */
  generate(options: ResolvedTTSOptions): Promise<TTSResult>;
  /** Quick availability check (no audio generation). */
  isAvailable(): Promise<boolean>;
  /** Health check that may generate a tiny audio sample. */
  healthCheck(): Promise<TTSProviderHealth>;
  /** List voices for this provider. */
  listVoices(): TTSVoiceInfo[];
}

/** Fully resolved internal options after defaults are applied. */
interface ResolvedTTSOptions {
  text: string;
  voice: string;
  language: string;
  speed: number;
}

// ─── Language / Text Helpers ──────────────────────────────────────────

function isArabic(text: string): boolean {
  const arabicChars = text.match(/[\u0600-\u06FF]/g) || [];
  return arabicChars.length > text.length * 0.15;
}

function detectLanguage(text: string): string {
  return isArabic(text) ? 'ar' : 'en';
}

/** Map a generic voice key to an Edge TTS voice name. */
function resolveEdgeVoice(voice: string, language: string): string {
  // Direct Edge voice name (e.g. 'ar-EG-ShakirNeural')
  if (voice in EDGE_ARABIC_VOICES) return voice;

  // Shortcut mapping
  const shortcuts: Record<string, string> = {
    'egyptian-male': EDGE_EGYPTIAN_VOICES.male,
    'egyptian-female': EDGE_EGYPTIAN_VOICES.female,
    'male': EDGE_EGYPTIAN_VOICES.male,
    'female': EDGE_EGYPTIAN_VOICES.female,
    'saudi-male': 'ar-SA-HamedNeural',
    'saudi-female': 'ar-SA-ZariyahNeural',
    'emirati-male': 'ar-AE-HamdanNeural',
    'emirati-female': 'ar-AE-FatimaNeural',
  };

  if (shortcuts[voice]) return shortcuts[voice];

  // Default based on language
  if (language.startsWith('ar')) return EDGE_EGYPTIAN_VOICES.male;
  return 'en-US-GuyNeural'; // English default
}

/** Map a generic voice key to a Google TTS language code. */
function resolveGoogleLang(voice: string, language: string): string {
  const voiceMap: Record<string, string> = {
    'google-ar-eg-male': 'ar',
    'google-ar-eg-female': 'ar',
    'google-ar-fusha': 'ar',
    'google-en-male': 'en',
    'google-en-female': 'en',
  };

  if (voiceMap[voice]) return voiceMap[voice];
  return language.startsWith('ar') ? 'ar' : 'en';
}

/** Map a generic voice key to an HF MMS language code. */
function resolveHFLang(voice: string, language: string): MMSLanguage {
  // Direct HF voice IDs
  const hfVoice = HF_VOICES.find(v => v.id === voice);
  if (hfVoice) return hfVoice.language;

  // Shortcut mapping
  if (voice === 'hf-mms-shakir' || voice === 'egyptian-male' || voice === 'male') return 'arz';
  if (voice === 'hf-mms-fusha' || voice === 'fusha') return 'ara';

  // Default from language
  if (language === 'ar') return 'arz';
  return 'ara';
}

/** Convert speed (0.5–2.0) to Edge TTS rate string. */
function speedToEdgeRate(speed: number): string {
  if (speed > 1.0) return `+${Math.round((speed - 1) * 100)}%`;
  if (speed < 1.0) return `-${Math.round((1 - speed) * 100)}%`;
  return '+0%';
}

// ─── Edge TTS Adapter ────────────────────────────────────────────────

const edgeAdapter: ProviderAdapter = {
  name: 'edge',

  async generate(opts: ResolvedTTSOptions): Promise<TTSResult> {
    const voice = resolveEdgeVoice(opts.voice, opts.language);
    const rate = speedToEdgeRate(opts.speed);

    const audioBuffer = await edgeSynthesize({
      text: opts.text,
      voice,
      rate,
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    });

    return {
      audioBuffer,
      format: 'audio/mpeg',
      provider: 'edge',
    };
  },

  async isAvailable(): Promise<boolean> {
    // Edge TTS uses WebSocket — always available unless network is down.
    // We optimistically return true; errors are caught by the fallback chain.
    return true;
  },

  async healthCheck(): Promise<TTSProviderHealth> {
    const start = Date.now();
    try {
      const buffer = await edgeSynthesize({
        text: 'مرحبا',
        voice: EDGE_EGYPTIAN_VOICES.male,
        rate: '+0%',
      });
      return {
        provider: 'edge',
        available: buffer.length > 100,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        provider: 'edge',
        available: false,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  },

  listVoices(): TTSVoiceInfo[] {
    return Object.entries(EDGE_ARABIC_VOICES).map(([id, desc]) => {
      const parts = desc.split(' ');
      const genderStr = parts[0]?.toLowerCase() as 'male' | 'female';
      const region = parts.slice(1).join(' ');
      return {
        id,
        name: desc,
        provider: 'edge',
        locale: id.split('-').slice(0, 2).join('-'), // e.g. 'ar-EG'
        gender: genderStr === 'female' ? 'female' : 'male',
        format: 'audio/mpeg',
      };
    });
  },
};

// ─── Google TTS Adapter ──────────────────────────────────────────────

const googleAdapter: ProviderAdapter = {
  name: 'google',

  async generate(opts: ResolvedTTSOptions): Promise<TTSResult> {
    const lang = resolveGoogleLang(opts.voice, opts.language);
    const audioBuffer = await googleTTS(opts.text, lang);

    return {
      audioBuffer,
      format: 'audio/mpeg',
      provider: 'google',
    };
  },

  async isAvailable(): Promise<boolean> {
    // Google Translate TTS is free and requires no API key.
    return true;
  },

  async healthCheck(): Promise<TTSProviderHealth> {
    const start = Date.now();
    try {
      const buffer = await googleTTS('مرحبا', 'ar');
      return {
        provider: 'google',
        available: buffer.length > 100,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        provider: 'google',
        available: false,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  },

  listVoices(): TTSVoiceInfo[] {
    return GOOGLE_TTS_VOICES.map((v) => ({
      id: v.id,
      name: v.nameEn,
      provider: 'google',
      locale: v.lang,
      gender: v.gender,
      format: 'audio/mpeg',
    }));
  },
};

// ─── Gradio TTS Adapter ──────────────────────────────────────────────

const gradioAdapter: ProviderAdapter = {
  name: 'gradio',

  async generate(opts: ResolvedTTSOptions): Promise<TTSResult> {
    // Gradio MMS-TTS only supports Arabic
    const audioBuffer = await generateGradioArabicTTS(opts.text);

    return {
      audioBuffer,
      format: 'audio/wav',
      provider: 'gradio',
    };
  },

  async isAvailable(): Promise<boolean> {
    return isGradioTTSAvailable();
  },

  async healthCheck(): Promise<TTSProviderHealth> {
    const result = await checkGradioTTSHealth();
    return {
      provider: 'gradio',
      available: result.available,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  },

  listVoices(): TTSVoiceInfo[] {
    return [
      {
        id: 'gradio-mms-arabic',
        name: 'MMS Arabic (Gradio)',
        provider: 'gradio',
        locale: 'ar',
        gender: 'male',
        format: 'audio/wav',
      },
    ];
  },
};

// ─── HF TTS Adapter ──────────────────────────────────────────────────

const hfAdapter: ProviderAdapter = {
  name: 'hf',

  async generate(opts: ResolvedTTSOptions): Promise<TTSResult> {
    const lang = resolveHFLang(opts.voice, opts.language);
    const audioBuffer = await generateMMSAudio(opts.text, lang);

    return {
      audioBuffer,
      format: 'audio/wav',
      provider: 'hf',
    };
  },

  async isAvailable(): Promise<boolean> {
    return hasHFToken();
  },

  async healthCheck(): Promise<TTSProviderHealth> {
    const start = Date.now();
    try {
      if (!hasHFToken()) {
        return {
          provider: 'hf',
          available: false,
          latencyMs: Date.now() - start,
          error: 'HUGGINGFACE_API_TOKEN not set',
        };
      }
      const buffer = await generateMMSAudio('مرحبا', 'arz');
      return {
        provider: 'hf',
        available: buffer.length > 100,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        provider: 'hf',
        available: false,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  },

  listVoices(): TTSVoiceInfo[] {
    return HF_VOICES.map((v) => ({
      id: v.id,
      name: `${v.name} (${v.nameAr})`,
      provider: 'hf',
      locale: v.language === 'arz' ? 'ar-EG' : 'ar',
      gender: v.gender,
      format: 'audio/wav',
    }));
  },
};

// ─── Provider Registry ───────────────────────────────────────────────

const PROVIDERS: Record<TTSProvider, ProviderAdapter> = {
  edge: edgeAdapter,
  google: googleAdapter,
  gradio: gradioAdapter,
  hf: hfAdapter,
};

const DEFAULT_FALLBACK_CHAIN: TTSProvider[] = ['edge', 'google', 'gradio', 'hf'];

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Generate speech from text using the unified TTS facade.
 *
 * Automatically tries providers in the default fallback chain:
 *   Edge TTS → Google TTS → Gradio TTS → HF TTS
 *
 * If `preferredProvider` is set, only that provider is tried (no fallback).
 * If `fallbackChain` is set, providers are tried in that order.
 *
 * @example
 * ```ts
 * // Simple usage — auto-detect language, use fallback chain
 * const result = await generateSpeech({ text: 'مرحبا بالعالم' });
 *
 * // With explicit voice and speed
 * const result = await generateSpeech({
 *   text: 'Hello world',
 *   voice: 'egyptian-male',
 *   speed: 1.2,
 *   language: 'ar',
 * });
 *
 * // Force a specific provider
 * const result = await generateSpeech({
 *   text: 'مرحبا',
 *   preferredProvider: 'edge',
 * });
 *
 * // Custom fallback order
 * const result = await generateSpeech({
 *   text: 'مرحبا',
 *   fallbackChain: ['hf', 'google', 'edge'],
 * });
 * ```
 */
export async function generateSpeech(options: TTSOptions): Promise<TTSResult> {
  const { text, voice, speed = 1.0, preferredProvider, fallbackChain } = options;

  // Validate input
  if (!text || !text.trim()) {
    throw new TTSFascadeError('Text is required', 'none');
  }

  if (text.length > 10_000) {
    throw new TTSFascadeError('Text is too long (max 10,000 characters)', 'none');
  }

  if (speed < 0.5 || speed > 2.0) {
    throw new TTSFascadeError('Speed must be between 0.5 and 2.0', 'none');
  }

  // Resolve language
  const language = options.language || detectLanguage(text);

  // Resolve voice: default based on language
  const resolvedVoice = voice || (language.startsWith('ar') ? 'egyptian-male' : 'male');

  const resolved: ResolvedTTSOptions = {
    text,
    voice: resolvedVoice,
    language,
    speed,
  };

  // Determine which providers to try
  const providersToTry: TTSProvider[] = preferredProvider
    ? [preferredProvider]
    : (fallbackChain || DEFAULT_FALLBACK_CHAIN);

  const errors: Array<{ provider: TTSProvider; error: string }> = [];

  for (const providerName of providersToTry) {
    const adapter = PROVIDERS[providerName];
    if (!adapter) {
      console.warn(`[TTS-Unified] Unknown provider: ${providerName}`);
      continue;
    }

    try {
      console.log(`[TTS-Unified] Trying ${providerName}...`);
      const result = await adapter.generate(resolved);

      // Sanity check: ensure we got actual audio data
      if (result.audioBuffer.length <= 100) {
        throw new Error(`${providerName} returned empty audio (${result.audioBuffer.length} bytes)`);
      }

      console.log(
        `[TTS-Unified] ✅ ${providerName} succeeded: ` +
        `${(result.audioBuffer.length / 1024).toFixed(1)}KB, ` +
        `format=${result.format}`
      );

      return result;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[TTS-Unified] ❌ ${providerName} failed: ${errMsg.slice(0, 200)}`);
      errors.push({ provider: providerName, error: errMsg });
    }
  }

  // All providers failed
  const errorSummary = errors
    .map(e => `${e.provider}: ${e.error.slice(0, 80)}`)
    .join('; ');

  throw new TTSFascadeError(
    `All TTS providers failed — ${errorSummary}`,
    'all',
    errors
  );
}

/**
 * Generate speech using a specific provider with no fallback.
 * Throws immediately if the provider fails.
 */
export async function generateSpeechWithProvider(
  provider: TTSProvider,
  options: Omit<TTSOptions, 'preferredProvider' | 'fallbackChain'>
): Promise<TTSResult> {
  return generateSpeech({ ...options, preferredProvider: provider });
}

/**
 * Check the health of a specific TTS provider.
 * This may generate a tiny audio sample to verify end-to-end functionality.
 */
export async function checkProviderHealth(provider: TTSProvider): Promise<TTSProviderHealth> {
  const adapter = PROVIDERS[provider];
  if (!adapter) {
    return {
      provider,
      available: false,
      error: `Unknown provider: ${provider}`,
    };
  }
  return adapter.healthCheck();
}

/**
 * Check the health of all TTS providers.
 * Returns a map of provider → health status.
 */
export async function checkAllProvidersHealth(): Promise<Record<TTSProvider, TTSProviderHealth>> {
  const results = await Promise.allSettled(
    (Object.keys(PROVIDERS) as TTSProvider[]).map(async (name) => {
      const health = await PROVIDERS[name].healthCheck();
      return { name, health };
    })
  );

  const map: Partial<Record<TTSProvider, TTSProviderHealth>> = {};
  for (const result of results) {
    if (result.status === 'fulfilled') {
      map[result.value.name] = result.value.health;
    } else {
      // Shouldn't happen since healthCheck catches its own errors,
      // but handle gracefully
      const name = Object.keys(PROVIDERS)[results.indexOf(result)] as TTSProvider;
      map[name] = {
        provider: name,
        available: false,
        error: result.reason?.message || String(result.reason),
      };
    }
  }

  return map as Record<TTSProvider, TTSProviderHealth>;
}

/**
 * Quick availability check for a provider (no audio generation).
 */
export async function isProviderAvailable(provider: TTSProvider): Promise<boolean> {
  const adapter = PROVIDERS[provider];
  if (!adapter) return false;
  try {
    return await adapter.isAvailable();
  } catch {
    return false;
  }
}

/**
 * List all available voices across all providers (or a single provider).
 */
export function listVoices(provider?: TTSProvider): TTSVoiceInfo[] {
  if (provider) {
    const adapter = PROVIDERS[provider];
    return adapter ? adapter.listVoices() : [];
  }
  return (Object.values(PROVIDERS) as ProviderAdapter[]).flatMap(a => a.listVoices());
}

/**
 * Get the default fallback chain.
 */
export function getDefaultFallbackChain(): TTSProvider[] {
  return [...DEFAULT_FALLBACK_CHAIN];
}

// ─── Custom Error Class ──────────────────────────────────────────────

/**
 * Error thrown when the unified TTS facade cannot generate audio.
 * Contains details about which providers were tried and why they failed.
 */
export class TTSFascadeError extends Error {
  /** Which provider(s) were tried. 'all' means every provider in the chain failed. */
  public readonly attemptedProvider: string;
  /** Per-provider error details. */
  public readonly providerErrors: ReadonlyArray<{ provider: TTSProvider; error: string }>;

  constructor(
    message: string,
    attemptedProvider: string,
    providerErrors: Array<{ provider: TTSProvider; error: string }> = []
  ) {
    super(message);
    this.name = 'TTSFascadeError';
    this.attemptedProvider = attemptedProvider;
    this.providerErrors = providerErrors;
  }
}
