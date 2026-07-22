/**
 * V.45: Gemini-based ASR (Audio Speech Recognition)
 * 
 * Uses Google Gemini API for high-quality Arabic speech recognition.
 * User has GOOGLE_AI_KEY configured on HF Space.
 * 
 * Gemini supports audio input directly and handles Arabic dialects well.
 */

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-1.5-flash'; // V.45j: Use 1.5-flash (more widely available)

export function isGeminiASRAvailable(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Transcribe audio using Gemini.
 * 
 * @param audioBuffer - Audio file as Buffer (webm, wav, mp3, mp4, etc.)
 * @param language - Language code (ar, en, etc.)
 * @param mimeType - MIME type of the audio (e.g. 'audio/webm', 'audio/mp4')
 * @returns Transcribed text
 */
export async function transcribeWithGemini(
  audioBuffer: Buffer,
  language: string = 'ar',
  mimeType?: string
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_AI_KEY not configured');
  }

  // Convert audio to base64
  const base64Audio = audioBuffer.toString('base64');
  
  // V.45c: Detect MIME type if not provided
  // Gemini supports: audio/wav, audio/mp3, audio/aac, audio/ogg, audio/flac, audio/webm
  // For MP4 files, use audio/mp4 (Gemini supports it)
  const detectedMime = mimeType || 'audio/webm';

  const prompt = language === 'ar'
    ? 'اكتب النص اللي بتسمعه بالظبط. لو الكلام بالعامية المصرية، اكتبه بالعامية المصرية زي ما بيتقال. متحولش لفصحى.'
    : 'Transcribe the audio exactly as spoken.';


  console.log(`[Gemini-ASR] Transcribing: ${(audioBuffer.length / 1024).toFixed(1)}KB, language=${language}, mime=${detectedMime}`);

  // V.45f: For files > 1MB, use Gemini File API instead of inline_data
  // Gemini inline_data returns 400 for large files.
  // File API: upload file → get file URI → use in generateContent
  let fileUri: string | null = null;
  if (audioBuffer.length > 1024 * 1024) {
    try {
      console.log(`[Gemini-ASR] File > 1MB, using File API...`);
      const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;
      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'X-Goog-Upload-Protocol': 'raw', 'X-Goog-Upload-Content-Type': detectedMime },
        body: audioBuffer,
        signal: AbortSignal.timeout(60_000),
      });

      if (uploadResp.ok) {
        const uploadData = await uploadResp.json();
        fileUri = uploadData?.file?.uri || null;
        console.log(`[Gemini-ASR] File uploaded: ${fileUri?.slice(0, 80)}`);
      } else {
        const errText = await uploadResp.text();
        console.log(`[Gemini-ASR] File upload failed ${uploadResp.status}: ${errText.slice(0, 1000)}`);
      }
    } catch (uploadErr) {
      console.log(`[Gemini-ASR] File upload error:`, uploadErr instanceof Error ? uploadErr.message : String(uploadErr));
    }
  }

  // Build request body — use fileUri if available, otherwise inline_data
  const parts: any[] = [{ text: prompt }];
  if (fileUri) {
    parts.push({ file_data: { mime_type: detectedMime, file_uri: fileUri } });
  } else {
    parts.push({ inline_data: { mime_type: detectedMime, data: base64Audio } });
  }

  const requestBody = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.0, maxOutputTokens: 4096 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  console.log(`[Gemini-ASR] Request body:`, JSON.stringify(requestBody).slice(0, 500));
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (fetchErr) {
    console.log(`[Gemini-ASR] Fetch failed:`, fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
    throw new Error(`Gemini fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
  }

  console.log(`[Gemini-ASR] Response status: ${response.status}`);

  if (!response.ok) {
    const errText = await response.text();
    console.log(`[Gemini-ASR] Error ${response.status}: ${errText.slice(0, 1000)}`);
    throw new Error(`Gemini ASR error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  console.log(`[Gemini-ASR] Response body:`, JSON.stringify(data).slice(0, 500));
  
  // Check for safety blocks or empty responses
  if (!data?.candidates?.[0]) {
    console.log(`[Gemini-ASR] No candidates in response. Full response:`, JSON.stringify(data).slice(0, 500));
    if (data?.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
    }
    return '';
  }
  
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  console.log(`[Gemini-ASR] Success: "${text.slice(0, 80)}" (${text.length} chars)`);
  return text.trim();
}

// V.45k: Debug function to test Gemini API directly
export async function testGeminiConnection(): Promise<string> {
  const testBody = {
    contents: [{ parts: [{ text: 'Hello' }] }],
    generationConfig: { temperature: 0.0, maxOutputTokens: 100 },
  };
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(testBody),
  });
  
  const text = await resp.text();
  return `Status: ${resp.status}, Body: ${text.slice(0, 500)}`;
}
