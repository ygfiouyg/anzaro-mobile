import { NextRequest } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { query } = (await request.json()) as { query: string }
    if (!query) return Response.json({ error: 'query required' }, { status: 400 })
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are a concise web research assistant. Answer with the most useful, accurate, up-to-date facts.' },
        { role: 'user', content: query },
      ],
      thinking: { type: 'disabled' },
    } as any)
    return Response.json({ result: completion.choices[0]?.message?.content ?? '' })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
