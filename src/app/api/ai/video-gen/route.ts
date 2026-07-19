/**
 * POST /api/ai/video-gen
 * ======================
 * توليد فيديو بـ CogVideoX عبر BigModel / ZhipuAI API (async).
 *
 * Uses cogvideox-flash (FREE — no credits consumed) by default.
 *
 * Request body:
 *   { "prompt": "وصف الفيديو", "quality": "speed"|"quality", "with_audio": false }
 *
 * Response:
 *   { "success": true, "taskId": "...", "status": "PROCESSING" }
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ZAI_BASE = 'https://open.bigmodel.cn/api/paas/v4';

export async function POST(req: NextRequest) {
  try {
    const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
    if (!ZAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'ZAI_API_KEY env var not set. Get a free key at https://open.bigmodel.cn/usercenter/apikeys' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      prompt,
      image_url,
      quality = 'speed',
      with_audio = false,
      duration = 5,
      model = 'cogvideox-flash',  // ✅ FREE
    } = body;

    if (!prompt && !image_url) {
      return NextResponse.json({ success: false, error: 'prompt أو image_url مطلوب' }, { status: 400 });
    }

    const requestBody: any = {
      model,
      quality,
      with_audio,
      duration,
    };

    if (prompt) requestBody.prompt = prompt;
    if (image_url) requestBody.image_url = image_url;

    // CogVideoX API (async)
    const response = await fetch(`${ZAI_BASE}/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ success: false, error: `API error ${response.status}: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      taskId: data?.id || '',
      status: data?.task_status || 'PROCESSING',
      model,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/ai/video-gen?task_id=xxx
 * استعلام عن نتيجة الفيديو.
 */
export async function GET(req: NextRequest) {
  try {
    const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
    if (!ZAI_API_KEY) {
      return NextResponse.json({ success: false, error: 'ZAI_API_KEY env var not set' }, { status: 500 });
    }

    const url = new URL(req.url);
    const taskId = url.searchParams.get('task_id');

    if (!taskId) {
      return NextResponse.json({ success: false, error: 'task_id مطلوب' }, { status: 400 });
    }

    const response = await fetch(`${ZAI_BASE}/async-result/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${ZAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `API error ${response.status}` }, { status: 500 });
    }

    const data = await response.json();

    // استخرج الـ video URL و cover image من الـ response
    const videoResult = data?.video_result?.[0] || {};
    const videoUrl = videoResult.url || data?.video_url || data?.url || '';
    const coverUrl = videoResult.cover_image_url || '';

    return NextResponse.json({
      success: true,
      taskId,
      status: data?.task_status || 'PROCESSING',
      videoUrl,
      coverUrl,
      model: data?.model || 'cogvideox-flash',
      data,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
