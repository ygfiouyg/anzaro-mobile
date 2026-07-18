/**
 * POST /api/ai/mcp
 * =================
 * تشغيل أدوات MCP حقيقية.
 *
 * Request body:
 *   { "tool": "mcp-web-search", "input": "أحدث أخبار AI" }
 *
 * Response:
 *   { "success": true, "output": "...", "outputType": "text" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMCPTool, MCP_TOOLS } from '@/lib/ai-tools/mcp-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, input } = body;

    if (!tool) {
      return NextResponse.json({ success: false, error: 'tool مطلوب' }, { status: 400 });
    }

    if (!input || !input.trim()) {
      return NextResponse.json({ success: false, error: 'input مطلوب' }, { status: 400 });
    }

    const result = await runMCPTool(tool, input.trim());

    return NextResponse.json({
      success: result.success,
      tool,
      output: result.output,
      outputType: result.outputType || 'text',
      error: result.error,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/ai/mcp — قائمة أدوات MCP
 */
export async function GET() {
  return NextResponse.json({
    total: MCP_TOOLS.length,
    tools: MCP_TOOLS,
  });
}
