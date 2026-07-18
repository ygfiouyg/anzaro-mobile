import { NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { poolManager } from '@/lib/api-aggregator/pool-manager';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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

    const { id } = await context.params;

    // Check if endpoint exists
    const existing = await db.apiEndpoint.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'نقطة النهاية غير موجودة' },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Only allow specific fields to be updated
    const allowedFields = [
      'name',
      'priority',
      'isAvailable',
      'isFree',
      'apiKey',
      'authType',
      'authHeader',
      'apiFormat',
      'capabilities',
      'metadata',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'capabilities' || field === 'metadata') {
          // Serialize JSON objects
          updateData[field] = typeof body[field] === 'string'
            ? body[field]
            : JSON.stringify(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'لم يتم توفير حقول للتحديث' },
        { status: 400 }
      );
    }

    // If apiKey or authType is being updated, recalculate isAvailable
    if ('apiKey' in body || 'authType' in body) {
      const newAuthType = (updateData.authType as string) ?? existing.authType;
      const newApiKey = (updateData.apiKey as string) ?? existing.apiKey;
      // Only override isAvailable if not explicitly provided in this request
      if (!('isAvailable' in body)) {
        updateData.isAvailable = newAuthType === 'none' || !!newApiKey;
      }
    }

    const updated = await db.apiEndpoint.update({
      where: { id },
      data: updateData,
    });

    // Invalidate pool cache after update
    await poolManager.invalidateCache();

    return NextResponse.json({ endpoint: updated });
  } catch (err) {
    console.error('[Aggregator Pool PATCH] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في تحديث نقطة النهاية' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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

    const { id } = await context.params;

    // Check if endpoint exists
    const existing = await db.apiEndpoint.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'نقطة النهاية غير موجودة' },
        { status: 404 }
      );
    }

    // Delete the endpoint (cascade deletes validation logs)
    await db.apiEndpoint.delete({
      where: { id },
    });

    // Invalidate pool cache after deletion
    await poolManager.invalidateCache();

    return NextResponse.json({ message: 'تم حذف نقطة النهاية بنجاح' });
  } catch (err) {
    console.error('[Aggregator Pool DELETE] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في حذف نقطة النهاية' },
      { status: 500 }
    );
  }
}
