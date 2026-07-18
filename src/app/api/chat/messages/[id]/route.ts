import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';

// ─── DELETE /api/chat/messages/[id] ──────────────────────────────────
// Auth required — delete a message by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { error: 'التسجيل مطلوب لحذف الرسالة' },
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

    // Find the message
    const message = await db.message.findUnique({
      where: { id },
      include: { conversation: true },
    });

    if (!message) {
      return NextResponse.json(
        { error: 'الرسالة غير موجودة' },
        { status: 404 }
      );
    }

    // Verify ownership — either message belongs to user or conversation belongs to user
    if (message.conversation.userId !== user.id) {
      return NextResponse.json(
        { error: 'غير مصرح بحذف هذه الرسالة' },
        { status: 403 }
      );
    }

    // Delete the message
    await db.message.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'تم حذف الرسالة بنجاح' });
  } catch (error) {
    console.error('Delete message error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء حذف الرسالة' },
      { status: 500 }
    );
  }
}
