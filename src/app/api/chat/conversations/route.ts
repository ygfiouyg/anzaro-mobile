import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';

// ─── GET /api/chat/conversations ─────────────────────────────────────
// Auth required — returns list of user's conversations (latest first)
// with all messages for each conversation
export async function GET(request: NextRequest) {
  try {
    // Auth required
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { error: 'التسجيل مطلوب لعرض المحادثات' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { error: 'جلسة غير صالحة' },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const withMessages = searchParams.get('messages') === 'true';

    // Fetch conversations with optional message loading
    // FIX: Only load messages when explicitly requested to avoid over-fetching
    const conversations = await db.conversation.findMany({
      where: { userId: user.id, isArchived: false },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: withMessages ? undefined : 1, // Only last message for preview
        },
      },
    });

    // Format the response to match frontend Conversation type
    const formatted = conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      model: conv.model,
      language: conv.language,
      isArchived: conv.isArchived,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        model: msg.model ?? undefined,
        emotion: msg.emotion ?? undefined,
        quoteUsed: msg.quoteUsed ?? undefined,
        language: msg.language,
        attachments: msg.attachments ?? undefined,
        pdfUrl: msg.pdfUrl ?? undefined,
        isEdited: msg.isEdited,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
      })),
    }));

    return NextResponse.json({ conversations: formatted });
  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحميل المحادثات' },
      { status: 500 }
    );
  }
}
