import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Auth required
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'يرجى تسجيل الدخول أولاً' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'جلسة غير صالحة' },
        { status: 401 }
      );
    }

    // Get user's PDF assets
    const assets = await db.generativeAsset.findMany({
      where: {
        userId: user.id,
        type: 'pdf',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        filePath: true,
        fileSize: true,
        model: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Parse metadata for each asset
    const formattedAssets = assets.map((asset) => ({
      ...asset,
      metadata: asset.metadata ? JSON.parse(asset.metadata) : null,
    }));

    return NextResponse.json({
      success: true,
      assets: formattedAssets,
    });
  } catch (error) {
    console.error('PDF list error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء جلب قائمة PDF' },
      { status: 500 }
    );
  }
}
