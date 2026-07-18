import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';

    const where = activeOnly
      ? { expiresAt: { gte: new Date() } }
      : {};

    const sessions = await db.session.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Clean up expired sessions count
    const expiredCount = await db.session.count({
      where: { expiresAt: { lt: new Date() } },
    });

    const activeCount = await db.session.count({
      where: { expiresAt: { gte: new Date() } },
    });

    return NextResponse.json({
      sessions,
      activeCount,
      expiredCount,
      total: activeCount + expiredCount,
    });
  } catch (error) {
    console.error('Admin sessions GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');

    if (!sessionId) {
      // Delete all expired sessions
      const result = await db.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return NextResponse.json({
        success: true,
        message: `تم حذف ${result.count} جلسة منتهية`,
        deletedCount: result.count,
      });
    }

    // Delete specific session
    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 });
    }

    await db.session.delete({ where: { id: sessionId } });

    return NextResponse.json({
      success: true,
      message: 'تم حذف الجلسة بنجاح',
    });
  } catch (error) {
    console.error('Admin sessions DELETE error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
