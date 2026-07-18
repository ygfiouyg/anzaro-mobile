// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Google Translate TTS Service
// ═══════════════════════════════════════════════════════════════════════
// FREE Arabic TTS via Google Translate — no API key, no WebSocket!
// Just simple HTTP GET requests that return MP3 audio.
// Works everywhere including HuggingFace Spaces!
//
// Supports: Arabic (ar), Egyptian Arabic, English, and 100+ languages
// ═══════════════════════════════════════════════════════════════════════

// ─── Language / Voice Definitions ────────────────────────────────────
export interface GoogleTTSVoice {
  id: string;
  lang: string;        // Language code: ar, ar-EG, en, etc.
  name: string;        // Arabic display name
  nameEn: string;      // English name
  description: string; // Arabic description
  gender: 'male' | 'female';
  badge: string;
}

export const GOOGLE_TTS_VOICES: GoogleTTSVoice[] = [
  {
    id: 'google-ar-eg-male',
    lang: 'ar',
    name: 'شاكر',
    nameEn: 'Shakir (Egyptian)',
    description: 'مصري ذكر — واضح وطبيعي',
    gender: 'male',
    badge: '🇪🇬',
  },
  {
    id: 'google-ar-eg-female',
    lang: 'ar',
    name: 'سلمى',
    nameEn: 'Salma (Egyptian)',
    description: 'مصرية أنثى — دافئة وودودة',
    gender: 'female',
    badge: '🇪🇬',
  },
  {
    id: 'google-ar-fusha',
    lang: 'ar',
    name: 'فصحى',
    nameEn: 'Standard Arabic',
    description: 'عربي فصحى — رسمي ومحترف',
    gender: 'male',
    badge: '📖',
  },
  {
    id: 'google-en-male',
    lang: 'en',
    name: 'جيمس',
    nameEn: 'James (English)',
    description: 'إنجليزي ذكر — واضح',
    gender: 'male',
    badge: '🇬🇧',
  },
  {
    id: 'google-en-female',
    lang: 'en',
    name: 'إيما',
    nameEn: 'Emma (English)',
    description: 'إنجليزية أنثى — لطيفة',
    gender: 'female',
    badge: '🇬🇧',
  },
];

export function getGoogleTTSVoiceById(id: string): GoogleTTSVoice | undefined {
  return GOOGLE_TTS_VOICES.find(v => v.id === id);
}

// ─── Detect if text is Arabic ────────────────────────────────────────
export function isArabicText(text: string): boolean {
  const arabicChars = text.match(/[\u0600-\u06FF]/g) || [];
  return arabicChars.length > text.length * 0.15; // >15% Arabic chars
}

// ─── Google Translate TTS ────────────────────────────────────────────
const TTS_TIMEOUT_MS = 15_000;

/**
 * Generate speech using Google Translate TTS.
 * Returns MP3 audio buffer.
 * 
 * URL format: https://translate.google.com/translate_tts?ie=UTF-8&q=TEXT&tl=LANG&client=tw-ob
 * 
 * This is FREE, no API key needed, works via simple HTTP GET!
 */
export async function googleTTS(
  text: string,
  lang: string = 'ar'
): Promise<Buffer> {
  if (!text || !text.trim()) {
    throw new Error('Text is required');
  }

  // Google TTS has a limit of ~200 chars per request
  // Split text into chunks if needed
  const chunks = splitTextForGoogleTTS(text, 200);
  
  if (chunks.length === 1) {
    return fetchGoogleTTSChunk(chunks[0], lang);
  }

  // For multiple chunks, fetch each and concatenate MP3 data
  // MP3 files can be concatenated by simply joining the byte arrays
  const audioBuffers: Buffer[] = [];
  
  for (const chunk of chunks) {
    try {
      const buffer = await fetchGoogleTTSChunk(chunk, lang);
      audioBuffers.push(buffer);
    } catch (err) {
      console.error(`[GoogleTTS] Chunk failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  if (audioBuffers.length === 0) {
    throw new Error('All Google TTS chunks failed');
  }

  // Simple MP3 concatenation (works for most players)
  const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
  return Buffer.concat(audioBuffers, totalLength);
}

async function fetchGoogleTTSChunk(text: string, lang: string): Promise<Buffer> {
  const encodedText = encodeURIComponent(text);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;
  
  console.log(`[GoogleTTS] Fetching: lang=${lang}, ${text.length} chars`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'audio/mpeg, audio/*, */*',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Google TTS error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(audioBuffer));
    
    if (buffer.length <= 100) {
      throw new Error(`Google TTS returned empty audio (${buffer.length} bytes)`);
    }

    console.log(`[GoogleTTS] Success: ${(buffer.length / 1024).toFixed(1)}KB, lang=${lang}`);
    return buffer;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Text Splitting for Google TTS ───────────────────────────────────
function splitTextForGoogleTTS(text: string, maxLen: number = 200): string[] {
  const chunks: string[] = [];
  // Split at sentence boundaries for Arabic and English
  const sentences = text.match(/[^.!؟\n،؛!?]+[.!؟\n،؛!?]*/g) || [text];

  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + ' ' + trimmed).length <= maxLen) {
      current = current ? current + ' ' + trimmed : trimmed;
    } else {
      if (current) chunks.push(current.trim());
      // If a single sentence is too long, split it at word boundaries
      if (trimmed.length > maxLen) {
        const words = trimmed.split(/\s+/);
        let wordChunk = '';
        for (const word of words) {
          if ((wordChunk + ' ' + word).length <= maxLen) {
            wordChunk = wordChunk ? wordChunk + ' ' + word : word;
          } else {
            if (wordChunk) chunks.push(wordChunk.trim());
            wordChunk = word;
          }
        }
        current = wordChunk;
      } else {
        current = trimmed;
      }
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}
