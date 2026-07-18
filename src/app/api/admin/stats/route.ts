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

    // Total conversations
    const totalConversations = await db.conversation.count();

    // Conversations today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const conversationsToday = await db.conversation.count({
      where: { createdAt: { gte: todayStart } },
    });

    // Messages by role
    const userMessages = await db.message.count({ where: { role: 'user' } });
    const assistantMessages = await db.message.count({ where: { role: 'assistant' } });

    // Total generative assets
    const totalAssets = await db.generativeAsset.count();
    const pdfCount = await db.generativeAsset.count({ where: { type: 'pdf' } });
    const imageCount = await db.generativeAsset.count({ where: { type: 'image' } });

    // Voice broadcasts
    const totalBroadcasts = await db.voiceBroadcast.count();

    // Token usage (simulated based on message count - approx 150 tokens per message pair)
    const estimatedTokens = (userMessages + assistantMessages) * 150;
    const tokenLimit = 100000;
    const tokenUsed = Math.min(estimatedTokens, tokenLimit);
    const tokenRemaining = Math.max(tokenLimit - tokenUsed, 0);

    // Active users per day for last 7 days
    const dailyStats: Array<{ date: string; messages: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayMessages = await db.message.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      });

      dailyStats.push({
        date: dayStart.toISOString().split('T')[0],
        messages: dayMessages,
      });
    }

    return NextResponse.json({
      totalConversations,
      conversationsToday,
      userMessages,
      assistantMessages,
      totalMessages: userMessages + assistantMessages,
      totalAssets,
      pdfCount,
      imageCount,
      totalBroadcasts,
      tokenUsed,
      tokenRemaining,
      tokenLimit,
      dailyStats,
    });
  } catch (error) {
    console.error('Admin stats GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
