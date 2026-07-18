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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { title: { contains: search } },
            { model: { contains: search } },
            { user: { email: { contains: search } } },
            { user: { name: { contains: search } } },
          ],
        }
      : {};

    const [conversations, total] = await Promise.all([
      db.conversation.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatar: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      db.conversation.count({ where }),
    ]);

    // Get stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const conversationsToday = await db.conversation.count({
      where: { createdAt: { gte: todayStart } },
    });

    const archivedCount = await db.conversation.count({
      where: { isArchived: true },
    });

    return NextResponse.json({
      conversations,
      total,
      page,
      limit,
      conversationsToday,
      archivedCount,
    });
  } catch (error) {
    console.error('Admin conversations GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
