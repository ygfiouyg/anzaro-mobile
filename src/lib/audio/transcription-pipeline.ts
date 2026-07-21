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

async function transcribeWithGroq(audioBuffer: Buffer, language: string, prompt?: string): Promise<{ text: string; rateLimited: boolean }> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY) return { text: '', rateLimited: false };

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'segment.wav');
  formData.append('model', 'whisper-large-v3');
  // V.35: Keep language='ar' for accuracy, but use the `prompt` parameter to
  // guide Whisper to output Egyptian Arabic dialect instead of MSA (Fusha).
  // Without a prompt, Whisper normalizes Egyptian dialect words to their MSA
  // equivalents (e.g., "إزيك" → "كيف حالك", "النهارده" → "اليوم").
  formData.append('language', language);
  formData.append('response_format', 'json');
  formData.append('temperature', '0.0'); // V.31: Prevent hallucination

  // V.35: Egyptian Arabic prompt — tells Whisper "this audio is Egyptian dialect,
  // output Egyptian Arabic, NOT Modern Standard Arabic"
  // The prompt should be in the same language/style as the expected output.
  const egyptianPrompt = prompt || 'الصوت ده بالعامية المصرية. اكتب اللي بتسمعه زي ما بيتقال بالظبط، بالعامية المصرية، من غير ما تحوّله لفصحى. يعني اكتب "إزيك" مش "كيف حالك"، و"النهارده" مش "اليوم"، و"كده" مش "هكذا"، و"عشان" مش "لأن"، و"بيقول" مش "يقول"، و"عملنا" مش "قمنا بعمل".';

  formData.append('prompt', egyptianPrompt);

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }, body: formData, signal: AbortSignal.timeout(120_000),
  });

  if (response.ok) {
    const data = await response.json();
    return { text: data.text || '', rateLimited: false };
  }

  const errText = await response.text().catch(() => '');
  console.error(`[Groq] ${response.status}: ${errText.slice(0, 200)}`);
  if (response.status === 429) return { text: '', rateLimited: true };
  return { text: '', rateLimited: false };
}

async function transcribeWithHF(audioBuffer: Buffer, language: string): Promise<string> {
  const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN || process.env.HF_TOKEN || '';
  if (!HF_TOKEN) return '';

  // V.35: Use whisper-large-v3-turbo (faster) as primary, but we can't pass a
  // prompt via the HF Inference API. The model will still tend to normalize
  // Egyptian to MSA, but it's our fallback when Groq is rate-limited.
  // TODO: If we need better Egyptian dialect support, use the OpenAI Whisper
  // API directly (supports prompt) or fine-tune a model on Egyptian Arabic.
  const url = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo';
  const response = await fetch(url, {
    method: 'POST', headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': 'audio/wav' }, body: audioBuffer, signal: AbortSignal.timeout(120_000),
  });

  if (response.ok) {
    const data = await response.json();
    return data.text || '';
  }

  // 503 = model loading — retry after 20s
  if (response.status === 503) {
    console.error('[HF] Model loading, waiting 20s...');
    await new Promise(r => setTimeout(r, 20_000));
    const retry = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': 'audio/wav' }, body: audioBuffer, signal: AbortSignal.timeout(120_000) });
    if (retry.ok) { const data = await retry.json(); return data.text || ''; }
  }

  const errText = await response.text().catch(() => '');
  console.error(`[HF] ${response.status}: ${errText.slice(0, 200)}`);
  return '';
}

async function transcribeSegment(audioBuffer: Buffer, language: string, useHF: boolean): Promise<{ text: string; provider: 'groq' | 'hf' }> {
  if (useHF) {
    console.error('[Transcribe] Using HF (Groq was rate limited)');
    return { text: await transcribeWithHF(audioBuffer, language), provider: 'hf' };
  }

  console.error('[Transcribe] Trying Groq...');
  const groqResult = await transcribeWithGroq(audioBuffer, language);
  if (groqResult.text) return { text: groqResult.text, provider: 'groq' };

  if (groqResult.rateLimited) {
    console.error('[Transcribe] Groq 429 — falling back to HF...');
    return { text: await transcribeWithHF(audioBuffer, language), provider: 'hf' };
  }

  console.error('[Transcribe] Groq failed, trying HF...');
  return { text: await transcribeWithHF(audioBuffer, language), provider: 'hf' };
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
  startSegment: number = 0
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

      const r = await transcribeSegment(segBuffer, lang, useHF);
      if (r.provider === 'hf') { useHF = true; provider = 'hf'; }

      results.push({ index: i, startTime: seg.startTime, endTime: seg.endTime, text: r.text });
      fullText += r.text + ' ';

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
