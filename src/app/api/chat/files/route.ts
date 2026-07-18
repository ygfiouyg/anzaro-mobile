import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token) {
    return NextResponse.json({ error: 'يرجى تسجيل الدخول' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 });
  }

  // Check if polling for a specific asset ID
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');

  if (assetId) {
    // Return the specific asset by ID (for file generation polling)
    const asset = await db.generativeAsset.findFirst({
      where: { id: assetId, userId: user.id },
    });

    if (!asset) {
      return NextResponse.json({ success: false, error: 'الأصل غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        type: asset.type,
        title: asset.title,
        prompt: asset.prompt,
        filePath: asset.filePath,
        fileSize: asset.fileSize,
        model: asset.model,
        createdAt: asset.createdAt,
        metadata: asset.metadata,
      },
    });
  }

  // Default: return all recent assets
  const assets = await db.generativeAsset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Parse metadata JSON for each asset to enrich the response
  const files = assets.map((asset) => {
    let parsedMetadata: Record<string, unknown> = {};
    try {
      parsedMetadata = asset.metadata ? JSON.parse(asset.metadata) : {};
    } catch {
      // Invalid JSON metadata — skip
    }
    return {
      id: asset.id,
      type: asset.type,
      title: asset.title,
      prompt: asset.prompt,
      filePath: asset.filePath,
      fileSize: asset.fileSize,
      model: asset.model,
      createdAt: asset.createdAt,
      driveLink: parsedMetadata.driveLink || null,
      fileUrl: parsedMetadata.fileUrl || null,
      mimeType: parsedMetadata.mimeType || null,
    };
  });

  return NextResponse.json({ success: true, files });
}
