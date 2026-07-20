// V.28: OpenAI Whisper via Groq API (FREE, fast, open source model)
export interface TranscriptionResult { text: string; language: string; chunks: Array<{ index: number; startTime: number; endTime: number; text: string }>; }
export function estimateDuration(fileSize: number, mimeType: string): number {
  const bitrates: Record<string, number> = { 'audio/mpeg': 128000, 'audio/mp3': 128000, 'audio/wav': 88200, 'audio/x-wav': 88200, 'audio/m4a': 128000, 'audio/mp4': 128000, 'audio/ogg': 112000, 'audio/aac': 128000, 'audio/webm': 128000 };
  return Math.floor(fileSize / ((bitrates[mimeType] || 128000) / 8));
}
export async function transcribeAudioChunk(audioBuffer: Buffer, mimeType: string, language?: string): Promise<{ text: string; language: string }> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured.');
  console.error(`[Whisper-Groq] size=${(audioBuffer.length / 1024).toFixed(1)}KB, mime=${mimeType}`);
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType || 'audio/mpeg' });
  formData.append('file', blob, 'audio.m4a');
  formData.append('model', 'whisper-large-v3');
  formData.append('language', language || 'ar');
  formData.append('response_format', 'json');
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }, body: formData, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) { const e = await response.text().catch(() => ''); throw new Error(`Groq Whisper ${response.status}: ${e.slice(0, 200)}`); }
  const data = await response.json();
  const text = data.text || '';
  console.error(`[Whisper-Groq] ✅ ${text.length} chars`);
  return { text, language: language || 'ar' };
}
export async function transcribeAudioFile(audioBuffer: Buffer, mimeType: string, onProgress?: (p: number, t: number, text: string) => void): Promise<TranscriptionResult> {
  const duration = estimateDuration(audioBuffer.length, mimeType);
  const MAX_CHUNK = 24 * 1024 * 1024;
  const chunkCount = Math.max(1, Math.ceil(audioBuffer.length / MAX_CHUNK));
  console.error(`[Whisper-Groq] chunks=${chunkCount}, size=${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);
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
      const r = await transcribeAudioChunk(audioBuffer.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, audioBuffer.length)), mimeType, lang);
      if (r.language) lang = r.language;
      results.push({ index: i, startTime: 0, endTime: 0, text: r.text });
      fullText += r.text + ' ';
      onProgress?.(i + 1, chunkCount, r.text);
    } catch { results.push({ index: i, startTime: 0, endTime: 0, text: '' }); onProgress?.(i + 1, chunkCount, ''); }
  }
  return { text: fullText.trim(), language: lang, chunks: results };
}
