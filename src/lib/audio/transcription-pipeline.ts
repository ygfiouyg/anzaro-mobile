export interface TranscriptionResult { text: string; language: string; chunks: Array<{ index: number; startTime: number; endTime: number; text: string }>; }
export function estimateDuration(fileSize: number, mimeType: string): number { return Math.floor(fileSize / 16); }
export async function transcribeAudioChunk(audioBuffer: Buffer, language?: string): Promise<{ text: string; language: string }> {
  const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
  if (!ZAI_API_KEY) throw new Error('ZAI_API_KEY not configured');
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
    method: 'POST', headers: { 'Authorization': `Bearer ${ZAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'whisper-1', audio: audioBuffer.toString('base64'), language: language || 'ar', response_format: 'json' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`ASR error ${response.status}`);
  const data = await response.json();
  return { text: data.text || '', language: data.language || language || 'ar' };
}
export async function transcribeAudioFile(audioBuffer: Buffer, mimeType: string, onProgress?: (p: number, t: number, text: string) => void): Promise<TranscriptionResult> {
  const duration = estimateDuration(audioBuffer.length, mimeType);
  const chunkCount = Math.max(1, Math.ceil(duration / 300));
  if (audioBuffer.length < 25 * 1024 * 1024) {
    const r = await transcribeAudioChunk(audioBuffer);
    onProgress?.(1, 1, r.text);
    return { text: r.text, language: r.language, chunks: [{ index: 0, startTime: 0, endTime: duration, text: r.text }] };
  }
  const chunkSize = Math.ceil(audioBuffer.length / chunkCount);
  const results: any[] = [];
  let fullText = '';
  for (let i = 0; i < chunkCount; i++) {
    try {
      const r = await transcribeAudioChunk(audioBuffer.subarray(i * chunkSize, Math.min((i+1) * chunkSize, audioBuffer.length)));
      results.push({ index: i, startTime: 0, endTime: 0, text: r.text });
      fullText += r.text + ' ';
      onProgress?.(i + 1, chunkCount, r.text);
    } catch { results.push({ index: i, startTime: 0, endTime: 0, text: '' }); onProgress?.(i + 1, chunkCount, ''); }
  }
  return { text: fullText.trim(), language: 'ar', chunks: results };
}
