import { NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { aggregationScheduler } from '@/lib/api-aggregator/scheduler';

export async function POST(request: Request) {
  try {
    // Auth check
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
    const user = await getUserFromToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح - مطلوب صلاحيات الآدمن' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { type } = body;

    if (!type || !['full_cycle', 'scrape', 'validate'].includes(type)) {
      return NextResponse.json(
        { error: 'نوع المهمة غير صالح. الأنواع المسموحة: full_cycle, scrape, validate' },
        { status: 400 }
      );
    }

    // Check if a running job already exists — stale job cleanup
    const runningJob = await db.apiAggregationJob.findFirst({
      where: { status: 'running' },
      orderBy: { createdAt: 'desc' },
    });

    if (runningJob) {
      // Check if it's stale (running > 10 minutes)
      const runningTime = Date.now() - new Date(runningJob.startedAt ?? runningJob.createdAt).getTime();
      if (runningTime > 10 * 60 * 1000) {
        // Mark as failed (stale)
        await db.apiAggregationJob.update({
          where: { id: runningJob.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errors: JSON.stringify(['تم إنهاء المهمة تلقائياً لتجاوزها المهلة (10 دقائق)']),
          },
        });
      } else {
        // Job is still fresh — reject the new trigger
        return NextResponse.json(
          { error: 'توجد مهمة قيد التشغيل بالفعل. يرجى الانتظار حتى تنتهي.' },
          { status: 409 }
        );
      }
    }

    // Create a new job
    const job = await db.apiAggregationJob.create({
      data: {
        type,
        status: 'pending',
      },
    });

    // Trigger the job in the background
    aggregationScheduler.triggerJob(job.id, type).catch((err) => {
      console.error('[Aggregator Trigger] Background job error:', err);
    });

    return NextResponse.json({
      jobId: job.id,
      type,
      status: 'pending',
    });
  } catch (err) {
    console.error('[Aggregator Trigger] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في تشغيل مهمة التجميع' },
      { status: 500 }
    );
  }
}
