// V.28: OpenAI Whisper (open source) via HuggingFace — NO BigModel
export interface TranscriptionResult { text: string; language: string; chunks: Array<{ index: number; startTime: number; endTime: number; text: string }>; }
export function estimateDuration(fileSize: number, mimeType: string): number {
  const bitrates: Record<string, number> = { 'audio/mpeg': 128000, 'audio/mp3': 128000, 'audio/wav': 88200, 'audio/x-wav': 88200, 'audio/m4a': 128000, 'audio/mp4': 128000, 'audio/ogg': 112000, 'audio/aac': 128000, 'audio/webm': 128000 };
  return Math.floor(fileSize / ((bitrates[mimeType] || 128000) / 8));
}
export async function transcribeAudioChunk(audioBuffer: Buffer, mimeType: string, language?: string): Promise<{ text: string; language: string }> {
  const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN || process.env.HF_TOKEN || '';
  if (!HF_TOKEN) throw new Error('HuggingFace token not configured.');
  const endpoints = [
    'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
    'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3',
    'https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo',
  ];
  const ct = mimeType || 'audio/mpeg';
  console.log(`[Whisper] size=${(audioBuffer.length / 1024).toFixed(1)}KB, mime=${ct}, token=${HF_TOKEN ? 'SET' : 'EMPTY'}`);
  for (const url of endpoints) {
    try {
      console.log(`[Whisper] Trying: ${url.split('/').pop()}`);
      const response = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': ct }, body: audioBuffer, signal: AbortSignal.timeout(120_000) });
      if (response.ok) {
        const data = await response.json();
        const text = data.text || '';
        console.log(`[Whisper] Success: ${text.length} chars`);
        return { text, language: language || 'ar' };
      }
      const errText = await response.text().catch(() => '');
      console.warn(`[Whisper] ${response.status}: ${errText.slice(0, 150)}`);
      if (response.status === 401 || response.status === 403) throw new Error(`HF token invalid (${response.status})`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('HF token invalid')) throw err;
      console.warn(`[Whisper] Failed:`, err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error('Whisper failed — check HF token.');
}
export async function transcribeAudioFile(audioBuffer: Buffer, mimeType: string, onProgress?: (p: number, t: number, text: string) => void): Promise<TranscriptionResult> {
  const duration = estimateDuration(audioBuffer.length, mimeType);
  const MAX_CHUNK = 25 * 1024 * 1024;
  const chunkCount = Math.max(1, Math.ceil(audioBuffer.length / MAX_CHUNK));
  console.log(`[Whisper] Starting: duration=${duration}s, chunks=${chunkCount}, size=${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);
  if (audioBuffer.length <= MAX_CHUNK) {
    const r = await transcribeAudioChunk(audioBuffer, mimeType);
    onProgress?.(1, 1, r.text);
    return { text: r.text, language: r.language, chunks: [{ index: 0, startTime: 0, endTime: duration, text: r.text }] };
  }
  const chunkSize = MAX_CHUNK;
  const results: any[] = [];
  let fullText = '';
  let lang = 'ar';
  for (let i = 0; i < chunkCount; i++) {
    try {
      const r = await transcribeAudioChunk(audioBuffer.subarray(i * chunkSize, Math.min((i+1) * chunkSize, audioBuffer.length)), mimeType, lang);
      if (r.language) lang = r.language;
      results.push({ index: i, startTime: 0, endTime: 0, text: r.text });
      fullText += r.text + ' ';
      onProgress?.(i + 1, chunkCount, r.text);
    } catch { results.push({ index: i, startTime: 0, endTime: 0, text: '' }); onProgress?.(i + 1, chunkCount, ''); }
  }
  return { text: fullText.trim(), language: lang, chunks: results };
}
