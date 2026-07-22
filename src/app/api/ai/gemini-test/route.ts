import { NextResponse } from 'next/server';
import { testGeminiConnection, isGeminiASRAvailable } from '@/lib/gemini-asr';

export async function GET() {
  if (!isGeminiASRAvailable()) {
    return NextResponse.json({ error: 'GOOGLE_AI_KEY not set' });
  }
  try {
    const result = await testGeminiConnection();
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
