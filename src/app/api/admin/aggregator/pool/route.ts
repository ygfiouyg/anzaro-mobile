import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { poolManager } from '@/lib/api-aggregator/pool-manager';

// ─── POST: Create a new endpoint manually ─────────────────────────
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const body = await request.json();
    const { name, provider, category, baseUrl, modelId, apiKey, authType, authHeader, apiFormat, isFree, priority } = body as {
      name: string;
      provider: string;
      category: string;
      baseUrl: string;
      modelId?: string;
      apiKey?: string;
      authType?: string;
      authHeader?: string;
      apiFormat?: string;
      isFree?: boolean;
      priority?: number;
    };

    // Validate required fields
    if (!name || !provider || !category || !baseUrl) {
      return NextResponse.json(
        { error: 'الاسم والمزود والفئة ورابط API مطلوبون' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await db.apiEndpoint.findFirst({
      where: {
        provider,
        category,
        baseUrl,
        modelId: modelId ?? null,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'نقطة النهاية هذه موجودة بالفعل', existingId: existing.id },
        { status: 409 }
      );
    }

    // Determine if endpoint requires auth and should be marked unavailable
    const effectiveAuthType = authType || 'none';
    const requiresAuth = effectiveAuthType === 'bearer' || effectiveAuthType === 'x-api-key' || effectiveAuthType === 'custom';
    const noApiKey = requiresAuth && !apiKey;
    const isAvailable = !noApiKey;

    // Create the endpoint
    const endpoint = await db.apiEndpoint.create({
      data: {
        name,
        provider,
        category,
        baseUrl,
        modelId: modelId ?? null,
        apiKey: apiKey ?? null,
        authType: effectiveAuthType as any,
        authHeader: authHeader ?? null,
        apiFormat: (apiFormat || 'openai') as any,
        isFree: isFree ?? false,
        isAvailable,
        priority: priority ?? 50,
        capabilities: null,
        metadata: noApiKey ? JSON.stringify({ noApiKey: true, reason: 'API key not provided' }) : null,
      },
    });

    // Refresh pool to include the new endpoint
    await poolManager.refreshPool();

    return NextResponse.json({
      message: 'تم إضافة نقطة النهاية بنجاح',
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        provider: endpoint.provider,
        category: endpoint.category,
        isAvailable: endpoint.isAvailable,
      },
    });
  } catch (err) {
    console.error('[Aggregator Pool] Create error:', err);
    return NextResponse.json(
      { error: 'خطأ في إنشاء نقطة النهاية' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Auth check
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const provider = searchParams.get('provider');
    const available = searchParams.get('available');
    const free = searchParams.get('free');

    // Build filter
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (provider) where.provider = provider;
    if (available !== null) where.isAvailable = available === 'true';
    if (free !== null) where.isFree = free === 'true';

    // Query endpoints
    const endpoints = await db.apiEndpoint.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { avgResponseMs: 'asc' }],
    });

    // Compute summary stats
    const totalEndpoints = endpoints.length;
    const availableEndpoints = endpoints.filter((e) => e.isAvailable).length;

    const byCategory: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    for (const ep of endpoints) {
      byCategory[ep.category] = (byCategory[ep.category] ?? 0) + 1;
      byProvider[ep.provider] = (byProvider[ep.provider] ?? 0) + 1;
    }

    return NextResponse.json({
      endpoints,
      summary: {
        totalEndpoints,
        availableEndpoints,
        byCategory,
        byProvider,
      },
    });
  } catch (err) {
    console.error('[Aggregator Pool] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في تحميل نقاط النهاية' },
      { status: 500 }
    );
  }
}
