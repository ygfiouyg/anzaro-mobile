/**
 * POST /api/ai/agent-tools — تشغيل وكيل
 * GET /api/ai/agent-tools — قائمة الوكلاء
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAgentTool, AGENT_TOOLS } from '@/lib/ai-tools/agent-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, input } = body;
    if (!tool) return NextResponse.json({ success: false, error: 'tool مطلوب' }, { status: 400 });
    if (!input) return NextResponse.json({ success: false, error: 'input مطلوب' }, { status: 400 });
    const result = await runAgentTool(tool, input);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ total: AGENT_TOOLS.length, tools: AGENT_TOOLS });
}
