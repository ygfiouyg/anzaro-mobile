// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Gradio TTS Service (MMS-TTS Arabic via @gradio/client)
// ═══════════════════════════════════════════════════════════════════════
// Calls our dedicated MMS-TTS Arabic Gradio Space for high-quality
// Egyptian Arabic TTS. Falls back to Google TTS if unavailable.
//
// Space: kopabdo/mms-tts-arabic
// Model: facebook/mms-tts-ara (covers Egyptian + Standard Arabic 🇪🇬)
// ═══════════════════════════════════════════════════════════════════════

import { Client } from '@gradio/client';

// ─── Configuration ─────────────────────────────────────────────────
const GRADIO_SPACE_ID = 'kopabdo/mms-tts-arabic';
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_TOKEN || '';

// ─── Client Singleton ─────────────────────────────────────────────
let gradioClient: Client | null = null;
let clientInitPromise: Promise<Client | null> | null = null;
let lastInitAttempt = 0;
const INIT_COOLDOWN_MS = 60_000; // Don't retry init more than once per minute

/**
 * Get or initialize the Gradio client.
 * Returns null if the Space is unavailable.
 */
async function getGradioClient(): Promise<Client | null> {
  // Return cached client if available
  if (gradioClient) return gradioClient;

  // Don't retry too frequently
  const now = Date.now();
  if (now - lastInitAttempt < INIT_COOLDOWN_MS && clientInitPromise) {
    return clientInitPromise;
  }
  lastInitAttempt = now;

  clientInitPromise = (async () => {
    try {
      console.log(`[GradioTTS] Connecting to ${GRADIO_SPACE_ID}...`);
      const options: any = {};
      if (HF_TOKEN) options.hf_token = HF_TOKEN;

      const client = await Client.connect(GRADIO_SPACE_ID, options);
      gradioClient = client;
      console.log(`[GradioTTS] Connected to ${GRADIO_SPACE_ID} ✅`);
      return client;
    } catch (error: any) {
      console.warn(`[GradioTTS] Failed to connect to ${GRADIO_SPACE_ID}:`, error?.message || String(error));
      gradioClient = null;
      return null;
    }
  })();

  return clientInitPromise;
}

// ─── Reset client (on error) ──────────────────────────────────────
function resetClient() {
  gradioClient = null;
  clientInitPromise = null;
}

// ─── Text Splitting (Arabic-aware) ────────────────────────────────
function splitForTTS(text: string, maxLen: number = 200): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!؟\n،؛]+[.!؟\n،؛]*/g) || [text];

  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + ' ' + trimmed).length <= maxLen) {
      current = current ? current + ' ' + trimmed : trimmed;
    } else {
      if (current) chunks.push(current.trim());
      current = trimmed;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}

// ─── WAV Header Parsing & Concatenation ───────────────────────────
const WAV_HEADER_SIZE = 44;

function parseWAVHeader(buffer: Buffer) {
  if (buffer.length < WAV_HEADER_SIZE) return null;
  const riff = buffer.toString('ascii', 0, 4);
  if (riff !== 'RIFF') return null;

  return {
    sampleRate: buffer.readUInt32LE(24),
    channels: buffer.readUInt16LE(22),
    bitsPerSample: buffer.readUInt16LE(34),
    dataSize: buffer.readUInt32LE(40),
  };
}

function createWAVHeader(
  dataLength: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(WAV_HEADER_SIZE);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

function concatenateWAVBuffers(buffers: Buffer[]): Buffer | null {
  if (buffers.length === 0) return null;
  if (buffers.length === 1) return buffers[0];

  const firstHeader = parseWAVHeader(buffers[0]);
  if (!firstHeader) return Buffer.concat(buffers);

  const { sampleRate, channels, bitsPerSample } = firstHeader;
  const pcmChunks: Buffer[] = [];

  for (const buf of buffers) {
    if (buf.length > WAV_HEADER_SIZE) {
      const header = parseWAVHeader(buf);
      if (header && header.sampleRate === sampleRate && header.channels === channels) {
        pcmChunks.push(buf.subarray(WAV_HEADER_SIZE));
      } else {
        pcmChunks.push(buf);
      }
    }
  }

  const totalPCMLength = pcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const newHeader = createWAVHeader(totalPCMLength, sampleRate, channels, bitsPerSample);
  return Buffer.concat([newHeader, ...pcmChunks], WAV_HEADER_SIZE + totalPCMLength);
}

// ─── Main TTS Function ────────────────────────────────────────────
const TTS_TIMEOUT_MS = 30_000;

/**
 * Generate Arabic speech using our MMS-TTS Gradio Space.
 * Returns WAV audio buffer.
 */
export async function generateGradioArabicTTS(text: string): Promise<Buffer> {
  if (!text || !text.trim()) {
    throw new Error('Text is required');
  }

  const client = await getGradioClient();
  if (!client) {
    throw new Error('Gradio TTS Space is unavailable');
  }

  // Split text into chunks (MMS works best with shorter chunks)
  const chunks = splitTextForGradio(text, 200);
  console.log(`[GradioTTS] Generating: ${chunks.length} chunks, ${text.length} chars`);

  const audioBuffers: Buffer[] = [];
  let failedChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i].trim()) continue;

    try {
      console.log(`[GradioTTS] Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);

      // Call the Gradio Space API
      const result = await Promise.race([
        client.predict('synthesize', [chunks[i]]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gradio TTS timeout')), TTS_TIMEOUT_MS)
        ),
      ]);

      // The result should contain audio data
      const audioData = (result as any)?.data?.[0];
      if (!audioData) {
        console.warn(`[GradioTTS] No audio data returned for chunk ${i + 1}`);
        failedChunks++;
        continue;
      }

      // Handle different response formats
      let audioBuffer: Buffer;

      if (audioData.url) {
        // Gradio returns a URL to the audio file
        const audioUrl = audioData.url.startsWith('http')
          ? audioData.url
          : `https://kopabdo-mms-tts-arabic.hf.space${audioData.url}`;

        console.log(`[GradioTTS] Fetching audio from: ${audioUrl.slice(0, 80)}...`);
        const audioResponse = await fetch(audioUrl, {
          headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {},
        });

        if (!audioResponse.ok) {
          throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
        }

        const arrayBuffer = await audioResponse.arrayBuffer();
        audioBuffer = Buffer.from(new Uint8Array(arrayBuffer));
      } else if (audioData instanceof Blob) {
        const arrayBuffer = await audioData.arrayBuffer();
        audioBuffer = Buffer.from(new Uint8Array(arrayBuffer));
      } else if (Buffer.isBuffer(audioData)) {
        audioBuffer = audioData;
      } else if (typeof audioData === 'string' && audioData.startsWith('data:')) {
        // Base64 data URL
        const base64 = audioData.split(',')[1];
        audioBuffer = Buffer.from(base64, 'base64');
      } else {
        console.warn(`[GradioTTS] Unknown audio format:`, typeof audioData);
        failedChunks++;
        continue;
      }

      if (audioBuffer.length > 100) {
        audioBuffers.push(audioBuffer);
        console.log(`[GradioTTS] Chunk OK: ${(audioBuffer.length / 1024).toFixed(1)}KB`);
      } else {
        console.warn(`[GradioTTS] Chunk ${i + 1}: audio too small (${audioBuffer.length} bytes)`);
        failedChunks++;
      }
    } catch (error: any) {
      console.error(`[GradioTTS] Chunk ${i + 1} error:`, error?.message || String(error));
      failedChunks++;

      // If it's a connection error, reset the client
      if (error?.message?.includes('connect') || error?.message?.includes('ECONNREFUSED')) {
        resetClient();
      }

      // If it's a timeout, don't retry remaining chunks
      if (error?.message?.includes('timeout')) {
        console.warn(`[GradioTTS] Timeout, skipping remaining chunks`);
        break;
      }
    }
  }

  if (audioBuffers.length === 0) {
    throw new Error(`Gradio TTS failed for all chunks (${failedChunks} failed)`);
  }

  // Concatenate audio buffers
  const combined = concatenateWAVBuffers(audioBuffers);
  if (!combined) {
    throw new Error('Failed to concatenate audio');
  }

  console.log(`[GradioTTS] Done: ${combined.length} bytes, ${failedChunks} failed`);
  return combined;
}

// ─── Text Splitting for Gradio ────────────────────────────────────
function splitTextForGradio(text: string, maxLen: number = 200): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!؟\n،؛]+[.!؟\n،؛]*/g) || [text];

  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + ' ' + trimmed).length <= maxLen) {
      current = current ? current + ' ' + trimmed : trimmed;
    } else {
      if (current) chunks.push(current.trim());
      current = trimmed;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}

// ─── Check if Gradio Space is available ───────────────────────────
export async function isGradioTTSAvailable(): Promise<boolean> {
  try {
    const client = await getGradioClient();
    return client !== null;
  } catch {
    return false;
  }
}

/**
 * Quick health check — try generating a tiny sample.
 */
export async function checkGradioTTSHealth(): Promise<{
  available: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const buffer = await generateGradioArabicTTS('مرحبا');
    return {
      available: buffer.length > 100,
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      available: false,
      latencyMs: Date.now() - start,
      error: error?.message || String(error),
    };
  }
}
