/**
 * POST /api/ai/media-tools — تشغيل أدوات الميديا
 * GET /api/ai/media-tools — قائمة الأدوات
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMediaTool, MEDIA_TOOLS, getVideoResult } from '@/lib/ai-tools/media-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, input, task_id } = body;

    // استعلام عن فيديو
    if (task_id) {
      const result = await getVideoResult(task_id);
      return NextResponse.json({
        success: result.success,
        status: result.status,
        videoUrl: result.videoUrl,
        coverUrl: result.coverUrl,
        error: result.error,
      });
    }

    if (!tool) return NextResponse.json({ success: false, error: 'tool مطلوب' }, { status: 400 });
    if (!input) return NextResponse.json({ success: false, error: 'input مطلوب' }, { status: 400 });

    const result = await runMediaTool(tool, input);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ total: MEDIA_TOOLS.length, tools: MEDIA_TOOLS });
}
