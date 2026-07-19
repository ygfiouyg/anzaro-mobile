import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';

/**
 * GET /api/pdf/download/[assetId]
 * Looks up a GenerativeAsset by ID and redirects to the serve URL.
 * This bridges the PdfCreatorApp's download button (which uses assetId)
 * to the actual file serving endpoint (/api/pdf/serve/[filename]).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    if (!assetId) {
      return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
    }

    // Auth check — must be logged in
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Find the asset
    const asset = await db.generativeAsset.findUnique({
      where: { id: assetId },
      select: { id: true, filePath: true, type: true, userId: true },
    });

    if (!asset) {
      return NextResponse.json({ error: 'الملف غير موجود' }, { status: 404 });
    }

    // Extract filename from filePath (could be full path or just filename)
    const filename = asset.filePath.split('/').pop() || asset.filePath;

    // Redirect to the serve endpoint with download flag
    const serveUrl = `/api/pdf/serve/${encodeURIComponent(filename)}?download=1`;
    return NextResponse.redirect(serveUrl, { status: 302 });
  } catch (error) {
    console.error('[pdf/download] error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحميل الملف' },
      { status: 500 }
    );
  }
}
