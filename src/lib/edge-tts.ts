/**
 * Edge TTS Service — Direct require('msedge-tts') (no child process)
 *
 * Uses the Node.js msedge-tts package directly via require().
 * This works in the Next.js server runtime without webpack issues.
 */

// Use require to bypass webpack ESM/CJS resolution
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { MsEdgeTTS } = require('msedge-tts');

export const EGYPTIAN_VOICES = {
  female: 'ar-EG-SalmaNeural',
  male: 'ar-EG-ShakirNeural',
} as const;

export const ARABIC_VOICES: Record<string, string> = {
  'ar-SA-HamedNeural': 'Saudi Male',
  'ar-SA-ZariyahNeural': 'Saudi Female',
  'ar-EG-SalmaNeural': 'Egyptian Female',
  'ar-EG-ShakirNeural': 'Egyptian Male',
  'ar-AE-FatimaNeural': 'Emirati Female',
  'ar-AE-HamdanNeural': 'Emirati Male',
  'en-US-AriaNeural': 'English Female (US)',
  'en-US-GuyNeural': 'English Male (US)',
};

export interface EdgeTTSOptions {
  text: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  outputFormat?: string;
}

export async function synthesizeSpeech(options: EdgeTTSOptions): Promise<Buffer> {
  const {
    text,
    voice = EGYPTIAN_VOICES.male,
    rate = '+0%',
    outputFormat = 'audio-24khz-96kbitrate-mono-mp3',
  } = options;

  if (!text || !text.trim()) {
    throw new Error('Text is required');
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, outputFormat);

  const { audioStream } = tts.toStream(text.slice(0, 10000));

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      const partial = Buffer.concat(chunks);
      if (partial.length > 200) {
        resolve(partial);
      } else {
        reject(new Error('Edge TTS timeout (20s)'));
      }
    }, 20_000);

    audioStream.on('data', (chunk: any) => {
      chunks.push(Buffer.from(chunk));
    });

    audioStream.on('end', () => {
      clearTimeout(timeout);
      const result = Buffer.concat(chunks);
      if (result.length < 200) {
        reject(new Error(`Edge TTS audio too small (${result.length} bytes)`));
      } else {
        resolve(result);
      }
    });

    audioStream.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(new Error(`Edge TTS stream error: ${err.message}`));
    });
  });
}
