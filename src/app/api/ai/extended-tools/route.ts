/**
 * POST /api/ai/extended-tools — تشغيل أداة من الـ 15 أداة الإضافية
 * GET /api/ai/extended-tools — قائمة كل الأدوات
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAudioTool, AUDIO_TOOLS } from '@/lib/ai-tools/audio-tools';
import { runAdvRAGTool, ADV_RAG_TOOLS } from '@/lib/ai-tools/adv-rag-tools';
import { runAdvAgentTool, ADV_AGENT_TOOLS } from '@/lib/ai-tools/adv-agent-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, input } = body;
    if (!tool) return NextResponse.json({ success: false, error: 'tool مطلوب' }, { status: 400 });
    if (!input) return NextResponse.json({ success: false, error: 'input مطلوب' }, { status: 400 });

    // Audio tools
    if (tool.startsWith('audio-')) {
      const result = await runAudioTool(tool, input);
      return NextResponse.json(result);
    }
    // Advanced RAG tools
    if (tool.startsWith('rag-')) {
      const result = await runAdvRAGTool(tool, input);
      return NextResponse.json(result);
    }
    // Advanced Agent tools
    if (tool.startsWith('agent-')) {
      const result = await runAdvAgentTool(tool, input);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: `أداة غير معروفة: ${tool}` }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    total: AUDIO_TOOLS.length + ADV_RAG_TOOLS.length + ADV_AGENT_TOOLS.length,
    categories: {
      audio: AUDIO_TOOLS,
      adv_rag: ADV_RAG_TOOLS,
      adv_agents: ADV_AGENT_TOOLS,
    },
  });
}
