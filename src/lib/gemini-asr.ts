/**
 * V.45: Gemini-based ASR (Audio Speech Recognition)
 * 
 * Uses Google Gemini API for high-quality Arabic speech recognition.
 * User has GOOGLE_AI_KEY configured on HF Space.
 * 
 * Gemini supports audio input directly and handles Arabic dialects well.
 */

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash'; // Fast + supports audio

export function isGeminiASRAvailable(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Transcribe audio using Gemini.
 * 
 * @param audioBuffer - Audio file as Buffer (webm, wav, mp3, etc.)
 * @param language - Language code (ar, en, etc.)
 * @returns Transcribed text
 */
export async function transcribeWithGemini(
  audioBuffer: Buffer,
  language: string = 'ar'
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_AI_KEY not configured');
  }

  // Convert audio to base64
  const base64Audio = audioBuffer.toString('base64');
  
  // Determine MIME type — Gemini accepts audio/webm, audio/wav, audio/mp3, etc.
  // Default to audio/webm (what MediaRecorder produces)
  const mimeType = 'audio/webm';

  const prompt = language === 'ar'
    ? 'اكتب النص اللي بتسمعه بالظبط. لو الكلام بالعامية المصرية، اكتبه بالعامية المصرية زي ما بيتقال. متحولش لفصحى.'
    : 'Transcribe the audio exactly as spoken.';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Audio,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 4096,
    },
  };

  console.log(`[Gemini-ASR] Transcribing: ${(audioBuffer.length / 1024).toFixed(1)}KB, language=${language}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini ASR error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  console.log(`[Gemini-ASR] Success: "${text.slice(0, 80)}" (${text.length} chars)`);
  return text.trim();
}
