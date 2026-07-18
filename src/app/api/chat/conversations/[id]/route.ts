import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';

// ─── GET /api/chat/conversations/[id] ────────────────────────────────
// Auth required — return conversation with all messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { error: 'التسجيل مطلوب لعرض المحادثة' },
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

    const { id } = await params;

    // Fetch conversation with all messages
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'المحادثة غير موجودة' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (conversation.userId !== user.id) {
      return NextResponse.json(
        { error: 'غير مصرح بالوصول لهذه المحادثة' },
        { status: 403 }
      );
    }

    // Format the response
    const formatted = {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      language: conversation.language,
      context: conversation.context,
      isArchived: conversation.isArchived,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        model: msg.model,
        emotion: msg.emotion,
        quoteUsed: msg.quoteUsed,
        language: msg.language,
        attachments: msg.attachments,
        pdfUrl: msg.pdfUrl,
        isEdited: msg.isEdited,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
      })),
    };

    return NextResponse.json({ conversation: formatted });
  } catch (error) {
    console.error('Get conversation error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحميل المحادثة' },
      { status: 500 }
    );
  }
}
