/**
 * POST /api/ai/vision-tools
 * =========================
 * تشغيل أدوات Vision & OCR الحقيقية.
 *
 * Request body:
 *   { "tool": "vision-analyze", "image": "data:image/...", "question": "إيه في الصورة؟" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { runVisionTool, VISION_TOOLS } from '@/lib/ai-tools/vision-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, image, question } = body;

    if (!tool) {
      return NextResponse.json({ success: false, error: 'tool مطلوب' }, { status: 400 });
    }

    if (!image) {
      return NextResponse.json({ success: false, error: 'image مطلوب (base64 data URI)' }, { status: 400 });
    }

    const result = await runVisionTool(tool, image, question);

    return NextResponse.json({
      success: result.success,
      tool,
      output: result.output,
      outputType: result.outputType,
      error: result.error,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ total: VISION_TOOLS.length, tools: VISION_TOOLS });
}
