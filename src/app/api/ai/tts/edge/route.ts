/**
 * POST /api/ai/tts/edge
 * GET  /api/ai/tts/edge
 *
 * ─────────────────────────────────────────────────────────────────────
 * EGYPTIAN ARABIC TTS — Open-Source Model Pipeline
 * ─────────────────────────────────────────────────────────────────────
 * RESEARCH FILE VERDICT (research/FINAL-REPORT.md):
 *
 *   #1 MohamedRashad/Egyptian-Arabic-TTS (Hugging Face Space, RUNNING)
 *      - Genuine Egyptian Arabic open-source model (Chatterbox-based)
 *      - Gradio API endpoint: /infer_EGTTS
 *      - Returns authentic Egyptian dialect pronunciation
 *      - May be slow/cold-starting → 12s timeout
 *
 *   #2 Edge TTS (ar-EG-ShakirNeural) — authentic Egyptian, but can be blocked
 *   #3 Google Translate TTS (tl=ar) — free, no key, Arabic
 *   #4 StreamElements TTS — free, no key, Arabic Polly voices
 *
 * ARCHITECTURE — Multi-provider fallback chain:
 *   1. Try Egyptian HF Space (genuine Egyptian model) → 12s timeout
 *   2. Try Edge TTS (ar-EG-ShakirNeural) → STRICT MP3 validation
 *   3. Try Google Translate TTS (tl=ar) → MP3 validation
 *   4. Try StreamElements TTS (Hassan/Zeina) → MP3 validation
 *   5. All fail → explicit 503 error
 *
 * OUTPUT: Base64 JSON { audioData, voice, mimeType, provider, ... }
 * JSON is 100% text-safe — Next.js cannot corrupt it during serialization.
 * The frontend rebuilds a Data URI: `data:audio/wav;base64,...`
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/auth';
import { synthesizeSpeech, EGYPTIAN_VOICES } from '@/lib/edge-tts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════════
// HARDCODED EGYPTIAN VOICE WHITELIST
// ═══════════════════════════════════════════════════════════════════════
const EGYPTIAN_VOICE_WHITELIST = new Set<string>([
  EGYPTIAN_VOICES.male,
  EGYPTIAN_VOICES.female,
]);

const VOICE_ALIASES: Record<string, string> = {
  'egyptian-male': EGYPTIAN_VOICES.male,
  'egyptian-female': EGYPTIAN_VOICES.female,
  'male': EGYPTIAN_VOICES.male,
  'female': EGYPTIAN_VOICES.female,
  'shakir': EGYPTIAN_VOICES.male,
  'salma': EGYPTIAN_VOICES.female,
};

function resolveEgyptianVoice(voiceKey: string | undefined): string {
  if (!voiceKey) return EGYPTIAN_VOICES.male;
  const aliased = VOICE_ALIASES[voiceKey.toLowerCase()];
  if (aliased) return aliased;
  if (EGYPTIAN_VOICE_WHITELIST.has(voiceKey)) return voiceKey;
  console.warn(`[TTS] Rejected non-Egyptian voice "${voiceKey}" — forcing ar-EG-ShakirNeural.`);
  return EGYPTIAN_VOICES.male;
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIO VALIDATION — accepts WAV, MP3 (frame sync), and ID3-tagged MP3
// ═══════════════════════════════════════════════════════════════════════
function isValidAudio(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 200) return false;
  // WAV: starts with "RIFF" (0x52 0x49 0x46 0x46)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return true;
  }
  // MP3 with ID3 tag: starts with "ID3" (0x49 0x44 0x33) — ElevenLabs format
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return true;
  }
  // MP3: first byte 0xFF, sync bits 111 (MPEG1) or 110 (MPEG2)
  if (buffer[0] === 0xFF) {
    const sync = (buffer[1] >> 5) & 0x07;
    if (sync === 0x07 || sync === 0x06) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER 0: ElevenLabs (HIGHEST QUALITY — multilingual Arabic)
// eleven_multilingual_v2 model supports Arabic natively.
// Free tier with full-access key.
// ═══════════════════════════════════════════════════════════════════════
async function tryElevenLabs(text: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY || '';
  if (!apiKey) {
    console.warn('[TTS:ElevenLabs] No ELEVENLABS_API_KEY in env');
    return null;
  }

  try {
    const voiceId = 'JBFqnCBsd6RMkjVDRZzb'; // George — deep, warm, excellent Arabic
    console.log(`[TTS:ElevenLabs] Trying voice=${voiceId}, text_len=${text.length}, preview="${text.slice(0, 40)}"`);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        model_id: 'eleven_multilingual_v2',
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn(`[TTS:ElevenLabs] HTTP ${response.status}: ${errBody.slice(0, 200)}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isValidAudio(buffer)) {
      console.warn(`[TTS:ElevenLabs] Invalid audio (first bytes: ${buffer.slice(0, 4).toString('hex')})`);
      return null;
    }

    console.log(`[TTS:ElevenLabs] ✅ Success: ${buffer.length} bytes`);
    return buffer;
  } catch (err) {
    console.warn(`[TTS:ElevenLabs] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function getMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'audio/wav';
  }
  return 'audio/mpeg';
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER 1: MohamedRashad/Egyptian-Arabic-TTS (Hugging Face Space)
// — Genuine Egyptian Arabic open-source model (Chatterbox-based)
// — Gradio API endpoint: /infer_EGTTS
// — Research file: "AliAbdallah/egyptian-arabic-tts-chatterbox" model
// ═══════════════════════════════════════════════════════════════════════
async function tryEgyptianSpace(text: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    console.log(`[TTS:EgyptianSpace] Trying text_len=${text.length}, preview="${text.slice(0, 40)}"`);

    // Dynamic import of @gradio/client (ESM module)
    const { client } = await import('@gradio/client');

    const app = await client('https://mohamedrashad-egyptian-arabic-tts.hf.space/', {
      // 12s timeout — the model may be cold-starting
    });

    // Submit the inference request
    const submission = app.submit('/infer_EGTTS', {
      text: text.slice(0, 500),  // cap at 500 chars for the open-source model
    });

    // Collect the result via async iteration
    let finalData: any = null;
    let timeoutHit = false;
    const timeoutHandle = setTimeout(() => { timeoutHit = true; }, 12_000);

    try {
      for await (const msg of submission) {
        if (timeoutHit) break;
        if (msg.type === 'data') {
          finalData = msg.data;
          break;
        }
        if (msg.type === 'status') {
          const status = (msg as any).status;
          if (status?.stage === 'error') {
            throw new Error(`Egyptian Space error: ${status.message || 'unknown'}`);
          }
        }
      }
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (timeoutHit) {
      console.warn('[TTS:EgyptianSpace] Timed out after 12s (cold start?)');
      return null;
    }

    if (!finalData || !Array.isArray(finalData) || !finalData[0]) {
      console.warn('[TTS:EgyptianSpace] No audio in response');
      return null;
    }

    const audioFile = finalData[0];
    let audioBuffer: Buffer | null = null;

    // Gradio returns { url, path, orig_name, ... } for file outputs
    if (audioFile.url) {
      console.log(`[TTS:EgyptianSpace] Downloading from: ${audioFile.url}`);
      const resp = await fetch(audioFile.url, { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) throw new Error(`Download HTTP ${resp.status}`);
      audioBuffer = Buffer.from(await resp.arrayBuffer());
    } else if (audioFile.path && typeof audioFile.path === 'string') {
      // Local path on the Space — fetch via the Space URL
      const fetchUrl = `https://mohamedrashad-egyptian-arabic-tts.hf.space/file=${audioFile.path}`;
      const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) throw new Error(`File download HTTP ${resp.status}`);
      audioBuffer = Buffer.from(await resp.arrayBuffer());
    } else if (typeof audioFile === 'string') {
      // Direct filepath string
      const fetchUrl = `https://mohamedrashad-egyptian-arabic-tts.hf.space/file=${audioFile}`;
      const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) throw new Error(`Filepath download HTTP ${resp.status}`);
      audioBuffer = Buffer.from(await resp.arrayBuffer());
    }

    if (!audioBuffer || !isValidAudio(audioBuffer)) {
      console.warn(`[TTS:EgyptianSpace] Invalid audio (first bytes: ${audioBuffer?.slice(0, 4).toString('hex') || 'none'})`);
      return null;
    }

    const mimeType = getMimeType(audioBuffer);
    console.log(`[TTS:EgyptianSpace] ✅ Valid audio: ${audioBuffer.length} bytes, type=${mimeType}`);
    return { buffer: audioBuffer, mimeType };
  } catch (err) {
    console.warn(`[TTS:EgyptianSpace] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER 2: Edge TTS (ar-EG-ShakirNeural)
// ═══════════════════════════════════════════════════════════════════════
async function tryEdgeTTS(text: string, voice: string, rate: string): Promise<Buffer | null> {
  try {
    console.log(`[TTS:Edge] Trying voice=${voice}, text_len=${text.length}`);
    const audioBuffer = await synthesizeSpeech({
      text, voice, rate, pitch: '+0Hz',
      outputFormat: 'audio-24khz-96kbitrate-mono-mp3',  // MP3 — Python edge-tts default
    });
    if (!isValidAudio(audioBuffer)) {
      console.warn(`[TTS:Edge] Invalid MP3 (first bytes: ${audioBuffer.slice(0, 4).toString('hex')})`);
      return null;
    }
    console.log(`[TTS:Edge] ✅ Valid MP3: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (err) {
    console.warn(`[TTS:Edge] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER 3: Google Translate TTS (tl=ar)
// ═══════════════════════════════════════════════════════════════════════
async function tryGoogleTranslateTTS(text: string): Promise<Buffer | null> {
  try {
    const chunks: Buffer[] = [];
    const maxLen = 190;
    const sentences = text.match(/[^.!?؟।\n]+[.!?؟।\n]?/g) || [text];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length > maxLen) {
        if (current) chunks.push(await fetchGoogleTranslateChunk(current.trim()));
        current = sentence;
      } else { current += sentence; }
    }
    if (current.trim()) chunks.push(await fetchGoogleTranslateChunk(current.trim()));
    const combined = Buffer.concat(chunks);
    if (!isValidAudio(combined)) {
      console.warn(`[TTS:Google] Invalid MP3`);
      return null;
    }
    console.log(`[TTS:Google] ✅ Valid MP3: ${combined.length} bytes`);
    return combined;
  } catch (err) {
    console.warn(`[TTS:Google] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function fetchGoogleTranslateChunk(text: string): Promise<Buffer> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&tl=ar&q=${encodeURIComponent(text)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'audio/mpeg' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Google TTS HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER 4: StreamElements TTS
// ═══════════════════════════════════════════════════════════════════════
async function tryStreamElementsTTS(text: string, isMale: boolean): Promise<Buffer | null> {
  try {
    const voice = isMale ? 'Hassan' : 'Zeina';
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text.slice(0, 500))}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'audio/mpeg' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`StreamElements HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isValidAudio(buffer)) {
      console.warn(`[TTS:StreamElements] Invalid MP3`);
      return null;
    }
    console.log(`[TTS:StreamElements] ✅ Valid MP3: ${buffer.length} bytes, voice=${voice}`);
    return buffer;
  } catch (err) {
    console.warn(`[TTS:StreamElements] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST — Multi-provider TTS with Base64 JSON output
// ═══════════════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    extractBearerToken(authHeader);
    const body = await request.json() as { text?: string; voice?: string; speed?: number };
    const rawText = body.text;
    const speed = typeof body.speed === 'number' ? body.speed : 1.0;
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return NextResponse.json({ error: 'النص مطلوب' }, { status: 400 });
    }
    const text = rawText.slice(0, 10000);
    const voice = resolveEgyptianVoice(body.voice);
    const isMale = voice === EGYPTIAN_VOICES.male;
    let rate = '+0%';
    if (speed > 1.0) rate = `+${Math.round((speed - 1) * 100)}%`;
    else if (speed < 1.0) rate = `-${Math.round((1 - speed) * 100)}%`;

    // ═══════════════════════════════════════════════════════════════════════
    // MULTI-PROVIDER FALLBACK CHAIN
    // ═══════════════════════════════════════════════════════════════════════
    let audioBuffer: Buffer | null = null;
    let providerUsed = '';
    let mimeType = 'audio/mpeg';

    // Provider 0: ElevenLabs (HIGHEST QUALITY — multilingual Arabic)
    if (!audioBuffer) {
      audioBuffer = await tryElevenLabs(text);
      if (audioBuffer) { providerUsed = 'elevenlabs'; mimeType = 'audio/mpeg'; }
    }

    // Provider 1: Egyptian HF Space (genuine Egyptian model)
    if (!audioBuffer) {
      const egyptianResult = await tryEgyptianSpace(text);
      if (egyptianResult) {
        audioBuffer = egyptianResult.buffer;
        mimeType = egyptianResult.mimeType;
        providerUsed = 'egyptian-space';
      }
    }

    // Provider 2: Edge TTS (authentic Egyptian Shakir/Salma)
    if (!audioBuffer) {
      audioBuffer = await tryEdgeTTS(text, voice, rate);
      if (audioBuffer) { providerUsed = 'edge'; mimeType = getMimeType(audioBuffer); }
    }

    // Provider 3: Google Translate TTS (Arabic)
    if (!audioBuffer) {
      console.log('[TTS] Edge failed → trying Google Translate TTS...');
      audioBuffer = await tryGoogleTranslateTTS(text);
      if (audioBuffer) { providerUsed = 'google-translate'; mimeType = 'audio/mpeg'; }
    }

    // Provider 4: StreamElements TTS (Arabic Polly voices)
    if (!audioBuffer) {
      console.log('[TTS] Google failed → trying StreamElements TTS...');
      audioBuffer = await tryStreamElementsTTS(text, isMale);
      if (audioBuffer) { providerUsed = 'streamelements'; mimeType = 'audio/mpeg'; }
    }

    if (!audioBuffer) {
      const elapsed = Date.now() - startTime;
      console.error(`[TTS] ALL PROVIDERS FAILED after ${elapsed}ms`);
      return NextResponse.json({
        error: 'فشل كل مزودي الخدمة (Egyptian Space + Edge + Google + StreamElements)',
        voice, elapsedMs: elapsed, hardFailure: true,
      }, { status: 503 });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[TTS] ✅ Success via ${providerUsed}: ${audioBuffer.length} bytes, ${elapsed}ms`);

    // ═══════════════════════════════════════════════════════════════════════
    // BASE64 JSON OUTPUT
    // ═══════════════════════════════════════════════════════════════════════
    const base64Audio = audioBuffer.toString('base64');
    return NextResponse.json({
      audioData: base64Audio,
      voice: voice,
      mimeType: mimeType,
      format: providerUsed === 'egyptian-space' ? 'chatterbox-egyptian' : 'audio-24khz-96kbitrate-mono-mp3',
      byteLength: audioBuffer.length,
      elapsedMs: elapsed,
      provider: providerUsed,
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Voice-Used': voice,
        'X-TTS-Provider': providerUsed,
        'X-Audio-Bytes': String(audioBuffer.length),
        'X-Audio-Duration-Ms': String(elapsed),
        'X-Egyptian-Voice-Enforced': 'true',
        'X-Delivery-Mode': 'base64-json',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const elapsed = Date.now() - startTime;
    console.error(`[TTS] Unhandled error after ${elapsed}ms:`, message);
    return NextResponse.json({
      error: 'خطأ داخلي في الخادم', detail: message, elapsedMs: elapsed, hardFailure: true,
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET — list available voices + provider info
// ═══════════════════════════════════════════════════════════════════════
export async function GET() {
  return NextResponse.json({
    providers: ['egyptian-space', 'edge', 'google-translate', 'streamelements'],
    enforcement: 'egyptian-only',
    voices: {
      egyptian: {
        male: { id: EGYPTIAN_VOICES.male, name: 'شاكر (مصري ذكر)' },
        female: { id: EGYPTIAN_VOICES.female, name: 'سلمى (مصرية أنثى)' },
      },
    },
    primaryProvider: 'MohamedRashad/Egyptian-Arabic-TTS (Hugging Face Space)',
    deliveryMode: 'base64-json',
    note: 'Genuine Egyptian model (Chatterbox) with Edge/Google/StreamElements fallbacks.',
  });
}
