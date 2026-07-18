/**
 * POST /api/ai/compare-tools — تشغيل أداة مقارنة/تقييم
 * GET /api/ai/compare-tools — قائمة الأدوات
 */

import { NextRequest, NextResponse } from 'next/server';
import { runCompareTool, COMPARE_TOOLS } from '@/lib/ai-tools/compare-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, input } = body;
    if (!tool) return NextResponse.json({ success: false, error: 'tool مطلوب' }, { status: 400 });
    if (!input) return NextResponse.json({ success: false, error: 'input مطلوب' }, { status: 400 });
    const result = await runCompareTool(tool, input);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ total: COMPARE_TOOLS.length, tools: COMPARE_TOOLS });
}
