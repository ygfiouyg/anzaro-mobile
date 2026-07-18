import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken, hashPassword, verifyPassword, invalidateAllUserSessionsCache } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          // password is selected only to compute hasPassword — stripped from response below
          password: true,
          // hasPassword is computed below, not a DB field
          role: true,
          maxTokens: true,
          isActive: true,
          isVerified: true,
          lastSeen: true,
          createdAt: true,
          _count: {
            select: {
              conversations: true,
              messages: true,
              sessions: true,
            },
          },
          sessions: {
            select: {
              id: true,
              // FIX: Don't expose session tokens in API response
              device: true,
              ip: true,
              expiresAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    // Compute hasPassword for each user (not a Prisma field)
    const usersWithHasPassword = users.map(({ sessions, ...u }) => ({
      ...u,
      hasPassword: !!u.password,
      password: undefined, // ensure password hash is never exposed
      sessions,
    }));

    return NextResponse.json({
      users: usersWithHasPassword,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action, newPassword, maxTokens } = body as {
      userId: string;
      action: 'block' | 'unblock' | 'promote' | 'demote' | 'delete' | 'change-password' | 'verify-password' | 'set-max-tokens';
      newPassword?: string;
      maxTokens?: number;
    };

    if (!userId || !action) {
      return NextResponse.json({ error: 'معرف المستخدم والإجراء مطلوبان' }, { status: 400 });
    }

    // Verify target user exists
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    }

    // Prevent self-modification (except password change — admin can change their own password too)
    if (userId === user.id && action !== 'change-password') {
      return NextResponse.json({ error: 'لا يمكنك تعديل حسابك الخاص' }, { status: 400 });
    }

    switch (action) {
      case 'block':
        await db.user.update({ where: { id: userId }, data: { isActive: false } });
        // Delete all sessions for blocked user
        await db.session.deleteMany({ where: { userId } });
        // ── FIX: Invalidate cached sessions so blocked user can't reuse them ──
        invalidateAllUserSessionsCache(userId);
        break;

      case 'unblock':
        await db.user.update({ where: { id: userId }, data: { isActive: true } });
        break;

      case 'promote':
        await db.user.update({ where: { id: userId }, data: { role: 'admin' } });
        break;

      case 'demote':
        await db.user.update({ where: { id: userId }, data: { role: 'user' } });
        break;

      case 'delete':
        await db.user.delete({ where: { id: userId } });
        break;

      case 'change-password': {
        if (!newPassword || newPassword.length < 6) {
          return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 });
        }
        const hashedNewPassword = await hashPassword(newPassword);
        await db.user.update({
          where: { id: userId },
          data: { password: hashedNewPassword },
        });
        // Invalidate all sessions for this user so they must re-login with new password
        await db.session.deleteMany({ where: { userId } });
        // ── FIX: Invalidate cached sessions so old token can't be reused ──
        invalidateAllUserSessionsCache(userId);
        return NextResponse.json({
          success: true,
          message: 'تم تغيير كلمة المرور بنجاح',
          // FIX: Don't return password hash to client
        });
      }

      case 'verify-password': {
        // FIX: Restricted to admin verifying their OWN password only
        // Previously allowed admin to check ANY user's password (password probing risk)
        if (userId !== user.id) {
          return NextResponse.json({ error: 'يمكنك التحقق من كلمة مرورك الخاصة فقط' }, { status: 403 });
        }
        if (!newPassword) {
          return NextResponse.json({ error: 'كلمة المرور مطلوبة للتحقق' }, { status: 400 });
        }
        // FIX: Must await bcrypt compare (async operation)
        const isValid = await verifyPassword(newPassword, targetUser.password || '');
        return NextResponse.json({
          success: true,
          valid: isValid,
          message: isValid ? 'كلمة المرور صحيحة ✓' : 'كلمة المرور غير صحيحة ✗',
        });
      }

      case 'set-max-tokens': {
        // ── Max tokens cap REMOVED per user request ──
        // This action is now a no-op (kept for API backward compatibility).
        // The platform no longer enforces any token cap — providers use their
        // own defaults. The DB field is retained but not enforced.
        return NextResponse.json({
          success: true,
          maxTokens: 0,
          message: 'تم إزالة حد التوكنز نهائياً من المنصة — لا يوجد حد أقصى الآن',
        });
      }

      default:
        return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تم تنفيذ الإجراء "${action}" بنجاح`,
    });
  } catch (error) {
    console.error('Admin users PATCH error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
