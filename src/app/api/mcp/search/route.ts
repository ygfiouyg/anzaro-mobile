import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// MCP tool: web_search — uses the ZAI SDK to answer with real-time-ish knowledge
export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as { query: string }
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are a concise web research assistant. Answer with the most useful, accurate, up-to-date facts. Cite sources if known.' },
        { role: 'user', content: query },
      ],
      thinking: { type: 'disabled' },
    } as any)
    return NextResponse.json({ result: completion.choices[0]?.message?.content ?? '' })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
