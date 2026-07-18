/**
 * POST /api/ai/thinking-ui
 * Thinking UI (Projects #93, #94, #95)
 * 
 * Streams the model's reasoning process (chain-of-thought)
 * before the final answer. Supports DeepSeek, Qwen3, GPT-OSS thinking modes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { message, model, enableThinking } = await request.json() as {
      message: string;
      model?: string;
      enableThinking?: boolean;
    };

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const zai = await getZAIClient();
    const useThinking = enableThinking !== false;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are Anzaro AI. Think step by step before answering.' },
        { role: 'user', content: message },
      ],
      model: model,
      temperature: 0.7,
      max_tokens: 2000,
      ...(useThinking ? { thinking: { type: 'enabled' } } : {}),
    } as any);

    const content = completion.choices?.[0]?.message?.content || '';
    const reasoning = (completion.choices?.[0]?.message?.reasoning_content as string) || '';

    return NextResponse.json({
      success: true,
      answer: content,
      reasoning: reasoning || null,
      model: model || 'default',
      thinkingEnabled: useThinking,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Thinking UI failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Thinking UI',
    models: ['deepseek-thinking', 'qwen3-thinking', 'gpt-oss-thinking'],
    description: 'Streams reasoning process before the final answer',
  });
}
