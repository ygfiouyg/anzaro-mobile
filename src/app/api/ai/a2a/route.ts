/**
 * POST /api/ai/a2a
 * Agent2Agent Protocol (Project #100)
 * 
 * Enables direct agent-to-agent task delegation and collaboration.
 * Agent A can ask Agent B to perform a task and get the result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface A2ATask {
  fromAgent: string;
  toAgent: string;
  task: string;           // description of the task
  context?: string;       // additional context
  expectedFormat?: string; // e.g. "json", "text", "markdown"
}

export async function POST(request: NextRequest) {
  try {
    const task = await request.json() as A2ATask;

    if (!task.fromAgent || !task.toAgent || !task.task) {
      return NextResponse.json({ error: 'fromAgent, toAgent, task required' }, { status: 400 });
    }

    // Execute the task using the LLM as the "receiving agent"
    const zai = await getZAIClient();
    const systemPrompt = `You are Agent "${task.toAgent}". 
Another agent ("${task.fromAgent}") has delegated this task to you:
${task.task}

${task.context ? `Context: ${task.context}` : ''}

${task.expectedFormat ? `Respond in ${task.expectedFormat} format.` : 'Respond clearly and concisely.'}

Complete the task to the best of your ability. You are an expert agent.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.task },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const result = completion.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      fromAgent: task.fromAgent,
      toAgent: task.toAgent,
      task: task.task,
      result,
      format: task.expectedFormat || 'text',
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'A2A task failed', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Agent2Agent Protocol',
    description: 'Enables direct agent-to-agent task delegation',
    usage: 'POST { fromAgent, toAgent, task, context?, expectedFormat? }',
  });
}
