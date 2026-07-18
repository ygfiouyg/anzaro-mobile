/**
 * GET /api/reminders
 * POST /api/reminders
 * 
 * GET: يجلب كل reminders للمستخدم الحالي
 * POST: ينشئ reminder جديد
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — list user's reminders
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const userEmail = ctx.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'no email' }, { status: 400 });
    }

    const reminders = await db.reminder.findMany({
      where: { userEmail },
      orderBy: { remindAt: 'asc' },
    });

    return NextResponse.json({ success: true, reminders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

// POST — create new reminder
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const userEmail = ctx.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'no email' }, { status: 400 });
    }

    const body = await req.json();
    const { taskText, remindAt } = body;

    if (!taskText || !remindAt) {
      return NextResponse.json({ error: 'taskText + remindAt مطلوبين' }, { status: 400 });
    }

    const reminder = await db.reminder.create({
      data: {
        userEmail,
        taskText,
        remindAt: new Date(remindAt),
        status: 'PENDING',
      },
    });

    return NextResponse.json({ success: true, reminder });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Reminders] Create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
