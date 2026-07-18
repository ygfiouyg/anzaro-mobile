/**
 * POST /api/ai/context-pipeline
 * Context Engineering Pipeline (Project #107)
 * Dynamically manages the LLM's context window.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function summarizeMessages(messages: Message[]): Promise<string> {
  const zai = await getZAIClient();
  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${m.content.slice(0, 500)}`)
    .join('\n');

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'لخص النقاط الرئيسية في 3-5 أسطر. حافظ على الأسماء والتواريخ.' },
      { role: 'user', content: `لخص:\n\n${conversationText}` },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  return completion.choices?.[0]?.message?.content || '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: Message[];
      maxTokens?: number;
      systemPrompt?: string;
    };

    if (!body.messages?.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    const maxTokens = body.maxTokens || 8000;
    const messages = body.messages;
    const originalTokens = messages.reduce((s, m) => s + estimateTokens(m.content), 0);

    if (originalTokens <= maxTokens) {
      return NextResponse.json({
        success: true,
        optimizedMessages: messages,
        originalTokenEstimate: originalTokens,
        optimizedTokenEstimate: originalTokens,
        compressionRatio: 1,
        summaryInjected: false,
      });
    }

    // Keep last 4 messages, summarize the rest
    const recent = messages.slice(-4);
    const old = messages.slice(0, -4);
    let optimized: Message[] = recent;
    let summaryInjected = false;

    if (old.length > 0) {
      const summary = await summarizeMessages(old);
      optimized = [{ role: 'system', content: `ملخص سابق:\n${summary}` }, ...recent];
      summaryInjected = true;
    }

    if (body.systemPrompt) {
      optimized.unshift({ role: 'system', content: body.systemPrompt });
    }

    const optimizedTokens = optimized.reduce((s, m) => s + estimateTokens(m.content), 0);

    return NextResponse.json({
      success: true,
      optimizedMessages: optimized,
      originalTokenEstimate: originalTokens,
      optimizedTokenEstimate: optimizedTokens,
      compressionRatio: originalTokens > 0 ? optimizedTokens / originalTokens : 1,
      summaryInjected,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Pipeline failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Context Engineering Pipeline',
    description: 'يدير الـ context window — يلخص الرسائل القديمة ويحتفظ بالأخيرة',
  });
}
