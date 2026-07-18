import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const { id } = await params;

    // Prevent self-modification
    if (id === user.id) {
      return NextResponse.json({ error: 'لا يمكنك تعديل حسابك الخاص' }, { status: 400 });
    }

    // Verify target user exists
    const targetUser = await db.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    }

    const body = await request.json();
    const { role, isActive, name, language } = body as {
      role?: string;
      isActive?: boolean;
      name?: string;
      language?: string;
    };

    // Validate role value
    if (role && !['user', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role value' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) updateData.name = name;
    if (language !== undefined) updateData.language = language;

    // If deactivating, delete all sessions
    if (isActive === false) {
      await db.session.deleteMany({ where: { userId: id } });
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isVerified: true,
        language: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'تم تحديث المستخدم بنجاح',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Admin users PUT error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const { id } = await params;

    // Prevent self-deletion
    if (id === user.id) {
      return NextResponse.json({ error: 'لا يمكنك حذف حسابك الخاص' }, { status: 400 });
    }

    // Verify target user exists
    const targetUser = await db.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    }

    await db.user.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: 'تم حذف المستخدم بنجاح',
    });
  } catch (error) {
    console.error('Admin users DELETE error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
