import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'

// Smart Ball TTS — converts text to speech using the platform's unified TTS service.
// Returns base64 audio that the frontend can play via Web Audio API.
export async function POST(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    const { text, voice } = (await req.json()) as { text: string; voice?: string }

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 })
    }

    // Use the platform's unified TTS facade (Edge TTS → Google → Gradio → HF)
    try {
      const { generateSpeech } = await import('@/lib/tts-unified')
      const result = await generateSpeech(text, {
        provider: 'edge',
        voice: voice || 'ar-EG-SalmaNeural',
        rate: 1.0,
        pitch: 1.0,
      })

      if (result?.audio) {
        // Convert Buffer to base64
        const base64 = Buffer.isBuffer(result.audio)
          ? result.audio.toString('base64')
          : Buffer.from(result.audio as ArrayBuffer).toString('base64')
        return NextResponse.json({
          ok: true,
          audio: base64,
          format: result.format || 'audio/mpeg',
          provider: result.provider || 'edge',
        })
      }
    } catch (ttsError: any) {
      console.error('[Smart Ball TTS] unified TTS failed:', ttsError.message)
    }

    // Fallback: return a simple error (no audio available)
    return NextResponse.json({
      ok: false,
      error: 'TTS service unavailable',
    }, { status: 503 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
