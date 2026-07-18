/**
 * POST /api/ai/image-gen
 * ======================
 * توليد صور بـ CogView عبر ZhipuAI API.
 *
 * Request body:
 *   { "prompt": "وصف الصورة", "size": "1024x1024" }
 *
 * Response:
 *   { "success": true, "url": "https://...", "base64": "..." }
 *   { "success": false, "error": "..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, size = '1024x1024', model = 'cogview-3-plus' } = body;

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'prompt مطلوب' }, { status: 400 });
    }

    const client = await getZAIClient();

    // CogView API
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ZAI_API_KEY}`,
      },
      body: JSON.stringify({ model, prompt, size }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ success: false, error: `API error ${response.status}: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url || '';

    if (!imageUrl) {
      return NextResponse.json({ success: false, error: 'لم يتم توليد صورة' }, { status: 500 });
    }

    // نجيب الصورة كـ base64 كمان (عشان نعرضها في الـ chat)
    let base64 = '';
    try {
      const imgRes = await fetch(imageUrl);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const mime = imgRes.headers.get('content-type') || 'image/png';
      base64 = `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      // مش مشكلة لو فشل — نرجع الـ URL
    }

    return NextResponse.json({
      success: true,
      url: imageUrl,
      base64,
      prompt,
      size,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
