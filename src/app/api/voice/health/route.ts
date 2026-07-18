import { NextResponse } from 'next/server';

// ZAI SDK singleton for health check
let zaiClient: any = null;

async function getZAIClient() {
  if (zaiClient) return zaiClient;
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiClient = await ZAI.create();
    return zaiClient;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Check if ZAI SDK TTS is available
    const zai = await getZAIClient();

    if (zai) {
      return NextResponse.json({
        status: 'ok',
        healthy: true,
        ttsAvailable: true,
        radioAvailable: false,
      });
    } else {
      return NextResponse.json({
        status: 'degraded',
        healthy: false,
        message: 'خدمة الصوت غير متاحة حالياً',
        ttsAvailable: false,
        radioAvailable: false,
      });
    }
  } catch {
    return NextResponse.json({
      status: 'degraded',
      healthy: false,
      message: 'خدمة الصوت غير متاحة حالياً',
      ttsAvailable: false,
      radioAvailable: false,
    });
  }
}
