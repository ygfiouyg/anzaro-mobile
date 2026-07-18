// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Groq Audio Module (STT + TTS)
// ═══════════════════════════════════════════════════════════════════════
// Ultra-fast speech services via Groq LPU:
//   - STT: whisper-large-v3-turbo / whisper-large-v3 / distil-whisper-large-v3-en
//     ~150x realtime, OpenAI-compatible /audio/transcriptions endpoint
//   - TTS: playai-tts-v2 (multilingual, replaces decommissioned playai-tts-arabic)
//     ~140 chars/sec, OpenAI-compatible /audio/speech endpoint
//
// All functions return HIGH-RESOLUTION timing data (process.hrtime.bigint)
// for benchmark-grade latency measurement.
//
// SERVER-SIDE ONLY. Do not import in client code.
// ═══════════════════════════════════════════════════════════════════════

import { traceAPI, traceError } from '@/lib/trace-logger';

export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

// ─── High-resolution timer helpers ─────────────────────────────────────
export type HrTime = bigint;

export function now(): HrTime {
  return process.hrtime.bigint();
}

/** Convert (end - start) bigint nanoseconds to milliseconds (float). */
export function msSince(start: HrTime, end: HrTime = now()): number {
  return Number(end - start) / 1_000_000;
}

export interface StageTiming {
  /** Time from request send to first response byte (ms). */
  ttfbMs: number;
  /** Total stage wall-clock time (ms). */
  totalMs: number;
  /** Bytes transferred (response body). */
  bytes: number;
  /** Provider HTTP status. */
  status: number;
  /** Error message if the stage failed. */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// STT — Groq Whisper
// ═══════════════════════════════════════════════════════════════════════

export type GroqWhisperModel =
  | 'whisper-large-v3-turbo'
  | 'whisper-large-v3'
  | 'distil-whisper-large-v3-en';

export interface GroqSTTResult {
  text: string;
  model: GroqWhisperModel;
  language?: string;
  durationSec?: number;
  timing: StageTiming;
  raw?: unknown;
}

/**
 * Transcribe audio via Groq Whisper.
 *
 * @param audio  Raw audio bytes (mp3, wav, webm, m4a...).
 * @param filename Filename hint for the multipart upload.
 * @param opts.model  Whisper model id (default: whisper-large-v3-turbo — fastest).
 * @param opts.language  ISO-639-1 language hint (e.g. 'ar', 'en').
 * @param opts.timeoutMs  Abort timeout in ms.
 */
export async function groqWhisperSTT(
  audio: Buffer,
  filename: string,
  opts: {
    model?: GroqWhisperModel;
    language?: string;
    timeoutMs?: number;
  } = {}
): Promise<GroqSTTResult> {
  const model: GroqWhisperModel = opts.model ?? 'whisper-large-v3-turbo';
  const language = opts.language ?? 'ar';
  const timeoutMs = opts.timeoutMs ?? 15_000;

  const form = new FormData();
  const blob = new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' });
  form.append('file', blob, filename);
  form.append('model', model);
  form.append('language', language);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const url = `${GROQ_API_BASE}/audio/transcriptions`;
  const start = now();
  let ttfb: HrTime | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    ttfb = now();
    clearTimeout(timer);

    const ttfbMs = msSince(start, ttfb);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const timing: StageTiming = {
        ttfbMs,
        totalMs: msSince(start),
        bytes: 0,
        status: res.status,
        error: `Groq STT ${res.status}: ${errBody.slice(0, 300)}`,
      };
      traceError(`[GroqAudio:STT] ${timing.error}`);
      return { text: '', model, language, timing };
    }

    const jsonText = await res.text();
    const totalMs = msSince(start);
    const bytes = Buffer.byteLength(jsonText);

    let parsed: any = {};
    try { parsed = JSON.parse(jsonText); } catch {}

    const text = (parsed.text ?? '').trim();
    traceAPI(`[GroqAudio:STT] ok model=${model} ttfb=${ttfbMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms text=${text.length}ch`);

    return {
      text,
      model,
      language,
      durationSec: typeof parsed.duration === 'number' ? parsed.duration : undefined,
      timing: { ttfbMs, totalMs, bytes, status: 200 },
      raw: parsed,
    };
  } catch (e) {
    const totalMs = msSince(start);
    const msg = e instanceof Error ? e.message : String(e);
    traceError(`[GroqAudio:STT] exception: ${msg}`);
    return {
      text: '',
      model,
      language,
      timing: { ttfbMs: ttfb ? msSince(start, ttfb) : -1, totalMs, bytes: 0, status: 0, error: msg },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TTS — Groq PlayAI (v2 multilingual)
// ═══════════════════════════════════════════════════════════════════════

export type GroqTTSVoice =
  | 'Hassan'        // Arabic male
  | 'Aisha'         // Arabic female
  | 'Felix-English'
  | 'Charlotte-English'
  | 'Alice-English';

export interface GroqTTSResult {
  audio: Buffer;          // raw WAV/MP3 bytes
  mimeType: string;
  model: string;
  voice: GroqTTSVoice;
  timing: StageTiming;
}

/**
 * Synthesize speech via Groq PlayAI TTS v2.
 *
 * @param text  Text to speak.
 * @param voice Voice id.
 * @param opts.format  'wav' | 'mp3' (default wav).
 * @param opts.speed   0.25–4.0 (default 1.0).
 */
export async function groqPlayAITTS(
  text: string,
  voice: GroqTTSVoice = 'Hassan',
  opts: { format?: 'wav' | 'mp3'; speed?: number; timeoutMs?: number } = {}
): Promise<GroqTTSResult> {
  const format = opts.format ?? 'wav';
  const speed = opts.speed ?? 1.0;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const model = 'playai-tts-v2';

  const url = `${GROQ_API_BASE}/audio/speech`;
  const body = JSON.stringify({
    model,
    voice,
    input: text.slice(0, 5000),
    response_format: format,
    speed,
  });

  const start = now();
  let ttfb: HrTime | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    ttfb = now();
    clearTimeout(timer);

    const ttfbMs = msSince(start, ttfb);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const timing: StageTiming = {
        ttfbMs,
        totalMs: msSince(start),
        bytes: 0,
        status: res.status,
        error: `Groq TTS ${res.status}: ${errBody.slice(0, 300)}`,
      };
      traceError(`[GroqAudio:TTS] ${timing.error}`);
      return { audio: Buffer.alloc(0), mimeType: '', model, voice, timing };
    }

    const arrayBuf = await res.arrayBuffer();
    const totalMs = msSince(start);
    const audio = Buffer.from(arrayBuf);
    const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';

    traceAPI(`[GroqAudio:TTS] ok voice=${voice} ttfb=${ttfbMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms ${audio.length}B`);

    return { audio, mimeType, model, voice, timing: { ttfbMs, totalMs, bytes: audio.length, status: 200 } };
  } catch (e) {
    const totalMs = msSince(start);
    const msg = e instanceof Error ? e.message : String(e);
    traceError(`[GroqAudio:TTS] exception: ${msg}`);
    return {
      audio: Buffer.alloc(0),
      mimeType: '',
      model,
      voice,
      timing: { ttfbMs: ttfb ? msSince(start, ttfb) : -1, totalMs, bytes: 0, status: 0, error: msg },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LLM — Groq Chat (thin wrapper with timing)
// ═══════════════════════════════════════════════════════════════════════

export interface GroqLLMResult {
  text: string;
  model: string;
  timing: StageTiming & { tokensIn?: number; tokensOut?: number; tps?: number };
}

/**
 * Generate a chat completion via Groq with full timing.
 * Uses non-streaming POST and measures TTFB + total + tokens/sec.
 */
export async function groqChatTimed(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: { model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<GroqLLMResult> {
  const model = opts.model ?? 'llama-3.1-8b-instant';
  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? 512;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const url = `${GROQ_API_BASE}/chat/completions`;
  const body = JSON.stringify({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  });

  const start = now();
  let ttfb: HrTime | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    ttfb = now();
    clearTimeout(timer);

    const ttfbMs = msSince(start, ttfb);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const timing: GroqLLMResult['timing'] = {
        ttfbMs, totalMs: msSince(start), bytes: 0, status: res.status,
        error: `Groq LLM ${res.status}: ${errBody.slice(0, 300)}`,
      };
      traceError(`[GroqAudio:LLM] ${timing.error}`);
      return { text: '', model, timing };
    }

    const jsonText = await res.text();
    const totalMs = msSince(start);
    let parsed: any = {};
    try { parsed = JSON.parse(jsonText); } catch {}

    const text = parsed?.choices?.[0]?.message?.content ?? '';
    const tokensIn = parsed?.usage?.prompt_tokens;
    const tokensOut = parsed?.usage?.completion_tokens;
    const tps = tokensOut && totalMs > 0 ? (tokensOut / totalMs) * 1000 : undefined;

    traceAPI(`[GroqAudio:LLM] ok model=${model} ttfb=${ttfbMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms toks=${tokensOut} tps=${tps?.toFixed(0)}`);

    return {
      text,
      model,
      timing: {
        ttfbMs, totalMs, bytes: Buffer.byteLength(jsonText), status: 200,
        tokensIn, tokensOut, tps,
      },
    };
  } catch (e) {
    const totalMs = msSince(start);
    const msg = e instanceof Error ? e.message : String(e);
    traceError(`[GroqAudio:LLM] exception: ${msg}`);
    return {
      text: '',
      model,
      timing: { ttfbMs: ttfb ? msSince(start, ttfb) : -1, totalMs, bytes: 0, status: 0, error: msg },
    };
  }
}
