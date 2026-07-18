/**
 * POST /api/ai/vision
 * ===================
 * تحليل الصور/PDF/الفيديو بـ GLM-4V عبر ZhipuAI API.
 *
 * Request body:
 *   { "image": "base64_data_uri", "question": "إيه في الصورة دي؟", "model": "glm-4v" }
 *
 * Response:
 *   { "success": true, "analysis": "..." }
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image, question = 'صفلي الصورة دي بالتفصيل', model = 'glm-4v' } = body;

    if (!image) {
      return NextResponse.json({ success: false, error: 'image مطلوب' }, { status: 400 });
    }

    const apiKey = process.env.ZAI_API_KEY;

    // Vision API
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ success: false, error: `Vision API error ${response.status}: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const data = await response.json();
    const analysis = data?.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      analysis,
      model,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
