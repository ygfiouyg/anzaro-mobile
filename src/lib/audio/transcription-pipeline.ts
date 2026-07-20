// V.31: Clean pipeline — no filters, temperature=0, HF fallback
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
}

export function estimateDuration(fileSize: number, mimeType: string): number {
  const bitrates: Record<string, number> = { 'audio/mpeg': 128000, 'audio/mp3': 128000, 'audio/wav': 88200, 'audio/x-wav': 88200, 'audio/m4a': 128000, 'audio/mp4': 128000, 'audio/ogg': 112000, 'audio/aac': 128000, 'audio/webm': 128000 };
  return Math.floor(fileSize / ((bitrates[mimeType] || 128000) / 8));
}

export function processAudioWithFfmpeg(inputBuffer: Buffer, inputExt: string, workDir: string): Array<{ buffer: Buffer; startTime: number; endTime: number; filePath: string }> {
  const inputFile = join(workDir, `input.${inputExt}`);
  const outputPattern = join(workDir, `seg_%04d.wav`);
  writeFileSync(inputFile, inputBuffer);

  const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputFile}"`, { encoding: 'utf-8', timeout: 30_000 }).trim();
  const totalDuration = Math.floor(parseFloat(probe) || 0);
  console.error(`[ffmpeg] Duration: ${totalDuration}s`);

  // V.31: NO audio filters — clean 16kHz mono WAV only (no highpass/lowpass/afftdn)
  execSync(`ffmpeg -i "${inputFile}" -ar 16000 -ac 1 -f segment -segment_time 60 "${outputPattern}" -y`, { encoding: 'utf-8', timeout: 600_000, stdio: 'pipe' });
  console.error(`[ffmpeg] Clean conversion done (no filters)`);

  const segments: Array<{ buffer: Buffer; startTime: number; endTime: number; filePath: string }> = [];
  let i = 0;
  while (true) {
    const segFile = join(workDir, `seg_${String(i).padStart(4, '0')}.wav`);
    if (!existsSync(segFile)) break;
    segments.push({ buffer: readFileSync(segFile), startTime: i * 60, endTime: Math.min((i + 1) * 60, totalDuration), filePath: segFile });
    i++;
  }
  console.error(`[ffmpeg] Created ${segments.length} segments`);
  return segments;
}

async function transcribeWithGroq(audioBuffer: Buffer, language: string): Promise<{ text: string; rateLimited: boolean }> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY) return { text: '', rateLimited: false };

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'segment.wav');
  formData.append('model', 'whisper-large-v3');
  formData.append('language', language);
  formData.append('response_format', 'json');
  formData.append('temperature', '0.0'); // V.31: Prevent hallucination

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

export async function transcribeAudioFile(audioBuffer: Buffer, mimeType: string, recordId: string, onProgress?: (p: number, t: number, text: string) => void): Promise<TranscriptionResult> {
  const ext = mimeType.split('/')[1] || 'm4a';
  const workDir = join(tmpdir(), `anzaro-${recordId}`);
  mkdirSync(workDir, { recursive: true });

  console.error(`[Pipeline] Starting: size=${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);

  const segments = processAudioWithFfmpeg(audioBuffer, ext, workDir);
  console.error(`[Pipeline] ffmpeg created ${segments.length} segments`);
  if (segments.length === 0) throw new Error('ffmpeg failed');

  await db.audioRecord.update({ where: { id: recordId }, data: { chunksCount: segments.length } }).catch(() => {});

  const results: Array<{ index: number; startTime: number; endTime: number; text: string }> = [];
  let fullText = '';
  let lang = 'ar';
  let provider: 'groq' | 'hf' = 'groq';
  let useHF = false;

  for (let i = 0; i < segments.length; i++) {
    console.error(`[Pipeline] Segment ${i + 1}/${segments.length}...`);
    try {
      const r = await transcribeSegment(segments[i].buffer, lang, useHF);
      if (r.provider === 'hf') { useHF = true; provider = 'hf'; }
      results.push({ index: i, startTime: segments[i].startTime, endTime: segments[i].endTime, text: r.text });
      fullText += r.text + ' ';
      onProgress?.(i + 1, segments.length, r.text);
      console.error(`[Pipeline] Segment ${i + 1}: ${r.text.length} chars via ${r.provider}`);
    } catch (err) {
      console.error(`[Pipeline] Segment ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ index: i, startTime: segments[i].startTime, endTime: segments[i].endTime, text: '' });
      onProgress?.(i + 1, segments.length, '');
    }
    await db.audioRecord.update({ where: { id: recordId }, data: { processedChunks: i + 1, progress: Math.round(((i + 1) / segments.length) * 100) } }).catch(() => {});
  }

  // Cleanup
  try {
    for (const seg of segments) { try { unlinkSync(seg.filePath); } catch {} }
    try { unlinkSync(join(workDir, `input.${ext}`)); } catch {}
    try { rmdirSync(workDir); } catch {}
  } catch {}

  console.error(`[Pipeline] Done! ${fullText.length} chars via ${provider}`);
  return { text: fullText.trim(), language: lang, chunks: results, provider };
}
