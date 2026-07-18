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

    // Get total users
    const totalUsers = await db.user.count();

    // Get active users (seen in last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers = await db.user.count({
      where: { lastSeen: { gte: oneDayAgo } },
    });

    // Get messages today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const messagesToday = await db.message.count({
      where: { createdAt: { gte: todayStart } },
    });

    // Get total messages
    const totalMessages = await db.message.count();

    // Get total conversations
    const totalConversations = await db.conversation.count();

    // Get conversations today
    const conversationsToday = await db.conversation.count({
      where: { createdAt: { gte: todayStart } },
    });

    // Get PDFs generated
    const pdfsGenerated = await db.generativeAsset.count({
      where: { type: 'pdf' },
    });

    // Get active sessions (not expired)
    const activeSessions = await db.session.count({
      where: { expiresAt: { gte: new Date() } },
    });

    // Get model usage breakdown
    const modelMessages = await db.message.groupBy({
      by: ['model'],
      where: { role: 'assistant', model: { not: null } },
      _count: { model: true },
      orderBy: { _count: { model: 'desc' } },
      take: 6,
    });

    const totalModelMessages = modelMessages.reduce((sum, m) => sum + m._count.model, 0) || 1;
    const modelUsage = modelMessages.map((m) => ({
      model: m.model || 'غير معروف',
      count: m._count.model,
      percentage: Math.round((m._count.model / totalModelMessages) * 100),
    }));

    // FIX: Parallelize the remaining sequential queries with Promise.all
    const [recentMessages, recentUsers, recentConversations] = await Promise.all([
      db.message.findMany({
        where: { role: 'user' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      db.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      db.conversation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: {
          user: { select: { email: true } },
        },
      }),
    ]);

    const recentActivity: Array<{ action: string; time: string; user: string; timestamp: Date }> = [];

    recentMessages.forEach((m) => {
      recentActivity.push({
        action: 'رسالة جديدة',
        time: getTimeAgo(m.createdAt),
        user: m.user?.email || 'مجهول',
        timestamp: m.createdAt,
      });
    });

    recentUsers.forEach((u) => {
      recentActivity.push({
        action: 'مستخدم جديد سجل',
        time: getTimeAgo(u.createdAt),
        user: u.email,
        timestamp: u.createdAt,
      });
    });

    recentConversations.forEach((c) => {
      recentActivity.push({
        action: 'محادثة جديدة',
        time: getTimeAgo(c.createdAt),
        user: c.user?.email || 'مجهول',
        timestamp: c.createdAt,
      });
    });

    // Sort by most recent (not random!)
    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Real database health check
    let dbHealthy = true;
    let dbResponseTime = 0;
    try {
      const dbStart = Date.now();
      await db.user.count({ take: 1 });
      dbResponseTime = Date.now() - dbStart;
    } catch {
      dbHealthy = false;
    }

    // Check API health (self-check)
    const apiHealthy = true;

    // Check PDF engine (GenerativeAsset availability)
    let pdfEngineHealthy = true;
    try {
      await db.generativeAsset.count({ take: 1 });
    } catch {
      pdfEngineHealthy = false;
    }

    return NextResponse.json({
      stats: {
        totalUsers,
        activeUsers,
        messagesToday,
        totalMessages,
        totalConversations,
        conversationsToday,
        pdfsGenerated,
        activeSessions,
        modelUsage,
        recentActivity,
      },
      health: {
        api: { status: apiHealthy, label: apiHealthy ? 'نشط' : 'متوقف' },
        database: { status: dbHealthy, label: dbHealthy ? 'نشط' : 'متوقف', responseTime: dbResponseTime },
        pdfEngine: { status: pdfEngineHealthy, label: pdfEngineHealthy ? 'نشط' : 'متوقف' },
      },
    });
  } catch (error) {
    console.error('Admin real-stats error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  return `منذ ${diffDays} يوم`;
}
