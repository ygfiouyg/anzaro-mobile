// V.33: Clean pipeline — no filters, temperature=0, HF fallback
// FIXES:
//   1. Lazy segment reading (one at a time → saves ~86MB RAM for 44-min files)
//   2. Partial transcript saved to DB after each segment (prevents data loss on crash)
//   3. Resume support via startSegment parameter
//   4. SSE-ready onProgress callback (called after every segment)
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { db } from '@/lib/db';

export interface TranscriptionResult {
  text: string;
  language: string;
  chunks: Array<{ index: number; startTime: number; endTime: number; text: string }>;
  provider: 'groq' | 'hf';
  totalSegments: number;
  processedSegments: number;
}

export function estimateDuration(fileSize: number, mimeType: string): number {
  const bitrates: Record<string, number> = { 'audio/mpeg': 128000, 'audio/mp3': 128000, 'audio/wav': 88200, 'audio/x-wav': 88200, 'audio/m4a': 128000, 'audio/mp4': 128000, 'audio/ogg': 112000, 'audio/aac': 128000, 'audio/webm': 128000 };
  return Math.floor(fileSize / ((bitrates[mimeType] || 128000) / 8));
}

/**
 * V.36: Clean up common transcription artifacts.
 *
 * Removes:
 *   - Channel/translator watermarks (e.g., "ترجمة نانسي قنقر" — appeared
 *     repeatedly in the user's chemistry lecture transcript)
 *   - Repeated "موسيقى" tags (keep only on the first segment)
 *   - Common Whisper hallucinations ("شكراً للمشاهدة", "اشترك في القناة")
 *   - Excessive whitespace
 *
 * @param text Raw transcription text from Whisper
 * @param isFirstSegment Whether this is the first segment (controls "موسيقى" removal)
 * @returns Cleaned text
 */
function cleanTranscriptionArtifacts(text: string, isFirstSegment: boolean): string {
  if (!text) return '';

  let cleaned = text;

  // Remove known channel watermarks/signatures (Arabic)
  const watermarks = [
    /ترجمة\s+نانسي\s+قنقر/gi,
    /ترجمة\s+نانسي/gi,
    /نانسي\s+قنقر/gi,
    /اشترك\s+في\s+القناة/gi,
    /Subscribe\s+to\s+(my\s+)?channel/gi,
    /شكراً?\s+للمشاهدة/gi,
    /Thanks\s+for\s+watching/gi,
    /لا\s+تنسى?\s+الاشتراك/gi,
    /فعل\s+جرس\s+التنبيه/gi,
  ];
  for (const w of watermarks) {
    cleaned = cleaned.replace(w, '');
  }

  // On segments after the first, remove "موسيقى" / "music" tags
  // (they're usually intro/outro music markers and shouldn't repeat)
  if (!isFirstSegment) {
    cleaned = cleaned.replace(/\bموسيقى\b/gi, '');
    cleaned = cleaned.replace(/\[music\]/gi, '');
    cleaned = cleaned.replace(/\[موسيقى\]/gi, '');
  }

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // Trim
  return cleaned.trim();
}

/**
 * Run ffmpeg to split the audio into 60-second 16kHz mono WAV segments.
 * Returns metadata (file paths + timing) WITHOUT reading the audio buffers
 * into memory — buffers are read lazily one-at-a-time during transcription.
 *
 * This saves ~86MB of RAM for a 44-minute file (45 segments × 1.92MB each).
 */
export function splitAudioWithFfmpeg(inputBuffer: Buffer, inputExt: string, workDir: string): Array<{ index: number; startTime: number; endTime: number; filePath: string }> {
  const inputFile = join(workDir, `input.${inputExt}`);
  const outputPattern = join(workDir, `seg_%04d.wav`);
  writeFileSync(inputFile, inputBuffer);

  const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputFile}"`, { encoding: 'utf-8', timeout: 30_000 }).trim();
  const totalDuration = Math.floor(parseFloat(probe) || 0);
  console.error(`[ffmpeg] Duration: ${totalDuration}s`);

  // V.31: NO audio filters — clean 16kHz mono WAV only (no highpass/lowpass/afftdn)
  execSync(`ffmpeg -i "${inputFile}" -ar 16000 -ac 1 -f segment -segment_time 60 "${outputPattern}" -y`, { encoding: 'utf-8', timeout: 600_000, stdio: 'pipe' });
  console.error(`[ffmpeg] Clean conversion done (no filters)`);

  // Collect segment file paths WITHOUT reading buffers (lazy loading)
  const segments: Array<{ index: number; startTime: number; endTime: number; filePath: string }> = [];
  let i = 0;
  while (true) {
    const segFile = join(workDir, `seg_${String(i).padStart(4, '0')}.wav`);
    if (!existsSync(segFile)) break;
    segments.push({ index: i, startTime: i * 60, endTime: Math.min((i + 1) * 60, totalDuration), filePath: segFile });
    i++;
  }
  console.error(`[ffmpeg] Created ${segments.length} segments (lazy-loaded)`);
  return segments;
}

async function transcribeWithHFModel(
  audioBuffer: Buffer,
  model: string,
  language: string,
  timeoutMs: number
): Promise<string> {
  const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN || process.env.HF_TOKEN || '';
  if (!HF_TOKEN) return '';

  const base = 'https://router.huggingface.co/hf-inference/models';
  const params = new URLSearchParams();
  if (language) params.set('language', language);
  const url = params.toString() ? `${base}/${model}?${params.toString()}` : `${base}/${model}`;

  console.error(`[Transcribe] Trying ${model} (timeout: ${timeoutMs / 1000}s)...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'audio/wav' };
    if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: new Uint8Array(audioBuffer),
    });

    console.error(`[Transcribe] ${model} response: status=${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[Transcribe] ${model} error ${response.status}: ${errorText.slice(0, 300)}`);

      // Cold start — wait and retry
      if (response.status === 503 && (errorText.includes('loading') || errorText.includes('currently loading'))) {
        console.error(`[Transcribe] ${model} loading, waiting 30s...`);
        await new Promise(r => setTimeout(r, 30_000));

        const retry = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: new Uint8Array(audioBuffer),
        });

        if (retry.ok) {
          const data = await retry.json();
          console.error(`[Transcribe] ${model} success after retry: "${(data.text || '').slice(0, 80)}"`);
          return data.text || '';
        }

        // Try ONE more time
        if (retry.status === 503) {
          console.error(`[Transcribe] ${model} still loading, waiting 30s more...`);
          await new Promise(r => setTimeout(r, 30_000));
          const retry2 = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers,
            body: new Uint8Array(audioBuffer),
          });
          if (retry2.ok) {
            const data2 = await retry2.json();
            return data2.text || '';
          }
        }
      }
      return '';
    }

    const data = await response.json();
    const text = data.text || '';
    console.error(`[Transcribe] ${model} success: "${text.slice(0, 80)}"`);
    return text;
  } catch (err) {
    console.error(`[Transcribe] ${model} exception:`, err instanceof Error ? err.message : String(err));
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

async function transcribeSegment(
  audioBuffer: Buffer,
  language: string,
  _useHF?: boolean,
  _onRetryWait?: (msg: string) => void
): Promise<{ text: string; provider: 'groq' | 'hf' }> {
  // V.43: ONLY use HF Whisper models — no Groq, no ZAI.
  // User explicitly requested:
  //   1. distil-whisper/distil-large-v3 (fast)
  //   2. openai/whisper-large-v3 (highest quality)
  //
  // For recordings, quality matters most:
  //   "في تحليل الريكوردات مش شرط عندي السرعه خالص اهم حاجة الجوده"
  // So we try distil first (fast), then fall back to large-v3 (best quality).

  // ── MODEL 1: distil-whisper/distil-large-v3 (fast) ──
  let text = await transcribeWithHFModel(
    audioBuffer,
    'distil-whisper/distil-large-v3',
    language,
    90_000 // 90s
  );
  if (text && text.trim()) {
    return { text, provider: 'hf' };
  }

  // ── MODEL 2: openai/whisper-large-v3 (highest quality) ──
  text = await transcribeWithHFModel(
    audioBuffer,
    'openai/whisper-large-v3',
    language,
    180_000 // 3 min — quality over speed
  );
  return { text, provider: 'hf' };
}

/**
 * V.33: Transcribe audio with lazy segment loading + partial transcript saving.
 *
 * @param audioBuffer  The raw audio file bytes
 * @param mimeType     MIME type (e.g. 'audio/m4a')
 * @param recordId     DB record ID (for progress + partial transcript saves)
 * @param onProgress   Callback after each segment: (current, total, segmentText, fullTextSoFar)
 * @param startSegment Resume from this segment index (default 0). Segments before
 *                     this are assumed already transcribed — their text is loaded
 *                     from the DB's partial transcript field.
 */
export async function transcribeAudioFile(
  audioBuffer: Buffer,
  mimeType: string,
  recordId: string,
  onProgress?: (current: number, total: number, segmentText: string, fullTextSoFar: string) => void,
  startSegment: number = 0,
  onHeartbeat?: (msg: string) => void
): Promise<TranscriptionResult> {
  const ext = mimeType.split('/')[1] || 'm4a';
  const workDir = join(tmpdir(), `anzaro-${recordId}`);
  mkdirSync(workDir, { recursive: true });

  console.error(`[Pipeline] Starting: size=${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB, startSegment=${startSegment}`);

  // Split audio into segments (lazy — no buffers loaded yet)
  const segments = splitAudioWithFfmpeg(audioBuffer, ext, workDir);
  console.error(`[Pipeline] ffmpeg created ${segments.length} segments`);
  if (segments.length === 0) throw new Error('ffmpeg failed');

  // Load partial transcript from DB if resuming
  let fullText = '';
  const results: Array<{ index: number; startTime: number; endTime: number; text: string }> = [];
  if (startSegment > 0) {
    const existing = await db.audioRecord.findUnique({ where: { id: recordId }, select: { transcript: true } }).catch(() => null);
    if (existing?.transcript) {
      fullText = existing.transcript;
      console.error(`[Pipeline] Resumed with ${fullText.length} chars of partial transcript`);
    }
  }

  await db.audioRecord.update({ where: { id: recordId }, data: { chunksCount: segments.length } }).catch(() => {});

  let lang = 'ar';
  let provider: 'groq' | 'hf' = 'groq';
  let useHF = false;

  // V.33: Process segments one-at-a-time with LAZY buffer loading
  // (read + transcribe + free memory before loading the next segment)
  for (let i = startSegment; i < segments.length; i++) {
    const seg = segments[i];
    console.error(`[Pipeline] Segment ${i + 1}/${segments.length}...`);

    try {
      // LAZY READ: load this segment's buffer just-in-time
      const segBuffer = readFileSync(seg.filePath);

      const r = await transcribeSegment(segBuffer, lang, useHF, onHeartbeat);
      if (r.provider === 'hf') { useHF = true; provider = 'hf'; }

      // V.36: Clean up common transcription artifacts:
      //   - Channel watermarks/signatures (e.g., "ترجمة نانسي قنقر")
      //   - Repeated "موسيقى" tags (keep only the first one)
      //   - Leading/trailing whitespace
      const cleanedText = cleanTranscriptionArtifacts(r.text, i === 0);

      results.push({ index: i, startTime: seg.startTime, endTime: seg.endTime, text: cleanedText });
      fullText += cleanedText + ' ';

      // V.33: Save PARTIAL transcript to DB after each segment
      // (prevents data loss if the process crashes or times out)
      await db.audioRecord.update({
        where: { id: recordId },
        data: {
          processedChunks: i + 1,
          progress: Math.round(((i + 1) / segments.length) * 100),
          transcript: fullText.trim(), // ← partial transcript saved!
        },
      }).catch(() => {});

      onProgress?.(i + 1, segments.length, r.text, fullText.trim());
      console.error(`[Pipeline] Segment ${i + 1}: ${r.text.length} chars via ${r.provider}`);

      // Free the buffer reference (GC can reclaim it before next iteration)
      (segBuffer as unknown as null) = null;
    } catch (err) {
      console.error(`[Pipeline] Segment ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ index: i, startTime: seg.startTime, endTime: seg.endTime, text: '' });

      // Still save partial progress
      await db.audioRecord.update({
        where: { id: recordId },
        data: {
          processedChunks: i + 1,
          progress: Math.round(((i + 1) / segments.length) * 100),
          transcript: fullText.trim(),
        },
      }).catch(() => {});

      onProgress?.(i + 1, segments.length, '', fullText.trim());
    }
  }

  // Cleanup segment files + input file + work directory
  try {
    for (const seg of segments) { try { unlinkSync(seg.filePath); } catch {} }
    try { unlinkSync(join(workDir, `input.${ext}`)); } catch {}
    try { rmdirSync(workDir); } catch {}
  } catch {}

  console.error(`[Pipeline] Done! ${fullText.length} chars via ${provider}`);
  return {
    text: fullText.trim(),
    language: lang,
    chunks: results,
    provider,
    totalSegments: segments.length,
    processedSegments: segments.length - startSegment,
  };
}
