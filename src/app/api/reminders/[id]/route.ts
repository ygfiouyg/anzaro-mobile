/**
 * DELETE /api/reminders/[id]
 * Deletes a specific reminder owned by the authenticated user.
 *
 * Architecture:
 * - Uses withAuth for session verification
 * - Validates ownership (userEmail match) before deletion
 * - Prevents IDOR (Insecure Direct Object Reference)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withAuth(async (
  _req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const userEmail = ctx.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'no email' }, { status: 400 });
    }

    const { id } = await params;

    // Verify ownership before deleting (prevent IDOR)
    const reminder = await db.reminder.findUnique({
      where: { id },
      select: { userEmail: true },
    });

    if (!reminder) {
      return NextResponse.json(
        { error: 'Reminder not found' },
        { status: 404 }
      );
    }

    if (reminder.userEmail !== userEmail) {
      return NextResponse.json(
        { error: 'Not authorized to delete this reminder' },
        { status: 403 }
      );
    }

    await db.reminder.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Reminders] Delete error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
