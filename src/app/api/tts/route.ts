import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

// ZAI SDK singleton for TTS
let zaiClient: any = null;

async function getZAIClient() {
  if (zaiClient) return zaiClient;
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiClient = await ZAI.create();
    return zaiClient;
  } catch (error) {
    console.error('[TTS] Failed to initialize ZAI SDK:', error);
    return null;
  }
}

// Split text into chunks of max 1024 characters, breaking at sentence boundaries
function splitTextIntoChunks(text: string, maxLength: number = 1000): string[] {
  const chunks: string[] = [];
  // Try to split at sentence boundaries
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      // If a single sentence is longer than maxLength, split it at word boundaries
      if (sentence.length > maxLength) {
        let remaining = sentence;
        while (remaining.length > 0) {
          const chunk = remaining.slice(0, maxLength);
          remaining = remaining.slice(maxLength);
          chunks.push(chunk.trim());
        }
        currentChunk = '';
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks.filter((c) => c.length > 0);
}

export async function POST(request: NextRequest) {
  try {
    // Auth required
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json() as { text?: string; voice?: string; speed?: number };
    const text = body.text;
    const voice = body.voice || 'tongtong';
    const speed = body.speed || 1.0;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'النص مطلوب' },
        { status: 400 }
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'النص طويل جداً (الحد الأقصى 5000 حرف)' },
        { status: 400 }
      );
    }

    // Use ZAI SDK directly
    const zai = await getZAIClient();
    if (!zai) {
      return NextResponse.json(
        { error: 'خدمة تحويل النص لصوت غير متاحة حالياً' },
        { status: 503 }
      );
    }

    try {
      // Split text into chunks (SDK max is 1024 chars per request)
      const chunks = splitTextIntoChunks(text, 1000);
      const audioBuffers: Buffer[] = [];

      for (const chunk of chunks) {
        const response = await zai.audio.tts.create({
          input: chunk,
          voice: voice,
          speed: speed,
          response_format: 'wav',
          stream: false,
        });

        // SDK returns a standard Response object
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(new Uint8Array(arrayBuffer));
        audioBuffers.push(buffer);
      }

      // Concatenate all audio buffers
      const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
      const combinedBuffer = Buffer.concat(audioBuffers, totalLength);

      // Return audio as response
      return new Response(new Uint8Array(combinedBuffer), {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(combinedBuffer.length),
          'Cache-Control': 'no-cache',
        },
      });
    } catch (ttsError: any) {
      console.error('[TTS] TTS generation error:', ttsError);
      // Reset client on error
      zaiClient = null;
      return NextResponse.json(
        { error: 'فشل في تحويل النص لصوت' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[TTS] Unhandled error:', error);
    return NextResponse.json(
      { error: 'خطأ داخلي في الخادم' },
      { status: 500 }
    );
  }
}
