import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from "@/lib/with-auth";
import { analyzeYouTubeVideo } from '@/lib/integrations/youtube-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = await req.json();
    const { url, question } = body;

    if (!url) {
      return NextResponse.json({ error: 'url مطلوب' }, { status: 400 });
    }

    const result = await analyzeYouTubeVideo(url, question);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
});
