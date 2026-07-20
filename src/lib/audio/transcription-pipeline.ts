// V.29: ffmpeg noise reduction + Groq Whisper (open source, FREE)
// 1. ffmpeg: convert to 16kHz mono WAV + noise reduction + split into 3-min segments
// 2. Groq Whisper-large-v3: transcribe each segment (99 languages, Egyptian Arabic)
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface TranscriptionResult { text: string; language: string; chunks: Array<{ index: number; startTime: number; endTime: number; text: string }>; }

export function estimateDuration(fileSize: number, mimeType: string): number {
  const bitrates: Record<string, number> = { 'audio/mpeg': 128000, 'audio/mp3': 128000, 'audio/wav': 88200, 'audio/x-wav': 88200, 'audio/m4a': 128000, 'audio/mp4': 128000, 'audio/ogg': 112000, 'audio/aac': 128000, 'audio/webm': 128000 };
  return Math.floor(fileSize / ((bitrates[mimeType] || 128000) / 8));
}

/**
 * Process audio with ffmpeg:
 * 1. Convert to 16kHz mono WAV (Whisper optimal format)
 * 2. Apply noise reduction: highpass=100Hz, lowpass=8000Hz, afftdn (spectral denoising)
 * 3. Split into 3-minute segments (under 10MB each for Groq)
 * Returns array of {buffer, startTime, endTime}
 */
function processAudioWithFfmpeg(inputBuffer: Buffer, inputExt: string): Array<{ buffer: Buffer; startTime: number; endTime: number }> {
  const tmpDir = join(tmpdir(), `anzaro-audio-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const inputFile = join(tmpDir, `input.${inputExt}`);
  const outputPattern = join(tmpDir, `seg_%03d.wav`);

  writeFileSync(inputFile, inputBuffer);

  try {
    // Get duration
    const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputFile}"`, { encoding: 'utf-8', timeout: 30_000 }).trim();
    const totalDuration = Math.floor(parseFloat(probe) || 0);
    console.error(`[ffmpeg] Duration: ${totalDuration}s (${(totalDuration/60).toFixed(1)} min)`);

    // Convert + noise reduction + split into 3-min segments
    // -ar 16000: 16kHz (Whisper optimal)
    // -ac 1: mono
    // -af highpass=f=100,lowpass=f=8000,afftdn=nr=10: noise reduction
    // -f segment -segment_time 180: 3-minute segments
    execSync(
      `ffmpeg -i "${inputFile}" -ar 16000 -ac 1 -af "highpass=f=100,lowpass=f=8000,afftdn=nr=10" -f segment -segment_time 180 "${outputPattern}" -y`,
      { encoding: 'utf-8', timeout: 300_000, stdio: 'pipe' }
    );
    console.error(`[ffmpeg] Processing + splitting done`);

    // Read segment files
    const segments: Array<{ buffer: Buffer; startTime: number; endTime: number }> = [];
    let i = 0;
    while (true) {
      const segFile = join(tmpDir, `seg_${String(i).padStart(3, '0')}.wav`);
      if (!existsSync(segFile)) break;
      segments.push({ buffer: readFileSync(segFile), startTime: i * 180, endTime: Math.min((i + 1) * 180, totalDuration) });
      try { unlinkSync(segFile); } catch {}
      i++;
    }

    try { unlinkSync(inputFile); } catch {}
    try { require('fs').rmdirSync(tmpDir); } catch {}

    console.error(`[ffmpeg] Created ${segments.length} clean segments`);
    return segments;
  } catch (err) {
    console.error(`[ffmpeg] Error: ${err instanceof Error ? err.message : String(err)}`);
    try { unlinkSync(inputFile); } catch {}
    try { require('fs').rmdirSync(tmpDir); } catch {}
    return [{ buffer: inputBuffer, startTime: 0, endTime: 0 }];
  }
}

/**
 * Transcribe a single WAV segment using Groq Whisper-large-v3
 */
export async function transcribeAudioChunk(audioBuffer: Buffer, _mimeType: string, language?: string): Promise<{ text: string; language: string }> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured.');

  console.error(`[Whisper] Segment: ${(audioBuffer.length / 1024).toFixed(1)}KB`);

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/wav' });
  formData.append('file', blob, 'segment.wav');
  formData.append('model', 'whisper-large-v3');
  formData.append('language', language || 'ar');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Groq Whisper ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.text || '';
  console.error(`[Whisper] ✅ ${text.length} chars: ${text.slice(0, 80)}`);
  return { text, language: language || 'ar' };
}

/**
 * Full pipeline: ffmpeg processing + Groq Whisper transcription
 */
export async function transcribeAudioFile(
  audioBuffer: Buffer,
  mimeType: string,
  onProgress?: (p: number, t: number, text: string) => void
): Promise<TranscriptionResult> {
  const ext = mimeType.split('/')[1] || 'm4a';

  console.error(`[Pipeline] Starting: size=${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB, mime=${mimeType}`);

  // Step 1: ffmpeg — convert + noise reduction + split
  const segments = processAudioWithFfmpeg(audioBuffer, ext);
  console.error(`[Pipeline] ffmpeg created ${segments.length} segments`);

  if (segments.length === 0) throw new Error('ffmpeg failed to create segments');

  // Step 2: Transcribe each segment with Groq Whisper
  const results: Array<{ index: number; startTime: number; endTime: number; text: string }> = [];
  let fullText = '';
  let lang = 'ar';

  for (let i = 0; i < segments.length; i++) {
    console.error(`[Pipeline] Transcribing segment ${i + 1}/${segments.length}...`);
    try {
      const r = await transcribeAudioChunk(segments[i].buffer, 'audio/wav', lang);
      if (r.language) lang = r.language;
      results.push({ index: i, startTime: segments[i].startTime, endTime: segments[i].endTime, text: r.text });
      fullText += r.text + ' ';
      onProgress?.(i + 1, segments.length, r.text);
    } catch (err) {
      console.error(`[Pipeline] Segment ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ index: i, startTime: segments[i].startTime, endTime: segments[i].endTime, text: '' });
      onProgress?.(i + 1, segments.length, '');
    }
  }

  console.error(`[Pipeline] Done! ${fullText.length} chars total`);
  return { text: fullText.trim(), language: lang, chunks: results };
}
