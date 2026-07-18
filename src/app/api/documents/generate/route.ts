import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from "@/lib/with-auth";
import { generateDocument } from '@/lib/integrations/document-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = await req.json();
    const { topic, type, language } = body;

    if (!topic || !type) {
      return NextResponse.json({ error: 'topic و type مطلوبين' }, { status: 400 });
    }

    if (!['docx', 'xlsx', 'pptx'].includes(type)) {
      return NextResponse.json({ error: 'type لازم يكون docx, xlsx, أو pptx' }, { status: 400 });
    }

    const result = await generateDocument({ topic, type, language: language || 'ar' });

    if (!result.success || !result.buffer) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
});
