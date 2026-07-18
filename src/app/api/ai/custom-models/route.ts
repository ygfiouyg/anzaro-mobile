import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ─── GET: Fetch active custom models for the model selector ────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category'); // "chat" | "image" | "video" | null (all)

    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;

    const customModels = await db.customModel.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    // Group by category
    const byCategory: Record<string, typeof customModels> = {};
    for (const m of customModels) {
      if (!byCategory[m.category]) byCategory[m.category] = [];
      byCategory[m.category].push(m);
    }

    // Mask API keys in response
    const sanitized = customModels.map(m => ({
      ...m,
      apiKey: m.apiKey ? '••••••••' : null,
    }));

    return NextResponse.json({
      models: sanitized,
      byCategory,
      total: customModels.length,
    });
  } catch (err) {
    console.error('[CustomModels] Fetch error:', err);
    return NextResponse.json({ models: [], byCategory: {}, total: 0 });
  }
}
