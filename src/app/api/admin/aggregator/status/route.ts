import { NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { aggregationScheduler } from '@/lib/api-aggregator/scheduler';
import { poolManager } from '@/lib/api-aggregator/pool-manager';

export async function GET(request: Request) {
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

    // Get scheduler status
    const schedulerStatus = aggregationScheduler.getStatus();

    // Query pool stats from DB directly for reliability
    const totalEndpoints = await db.apiEndpoint.count();
    const availableEndpoints = await db.apiEndpoint.count({ where: { isAvailable: true } });

    const byCategoryRaw = await db.apiEndpoint.groupBy({
      by: ['category'],
      _count: { category: true },
    });
    const byCategory: Record<string, number> = {};
    for (const row of byCategoryRaw) {
      byCategory[row.category] = row._count.category;
    }

    const byProviderRaw = await db.apiEndpoint.groupBy({
      by: ['provider'],
      _count: { provider: true },
    });
    const byProvider: Record<string, number> = {};
    for (const row of byProviderRaw) {
      byProvider[row.provider] = row._count.provider;
    }

    const lastUpdatedEndpoint = await db.apiEndpoint.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    const poolStats = {
      totalEndpoints,
      availableEndpoints,
      byCategory,
      byProvider,
      lastUpdate: lastUpdatedEndpoint?.updatedAt?.toISOString() ?? null,
    };

    // Get poolManager stats
    let poolManagerStats: ReturnType<typeof poolManager.getStats> | null = null;
    try {
      poolManagerStats = poolManager.getStats();
    } catch {
      // Pool manager may not be initialized yet
    }

    // Get recent jobs (last 10)
    const recentJobsRaw = await db.apiAggregationJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentJobs = recentJobsRaw.map((job) => {
      let errorsCount = 0;
      if (job.errors) {
        try {
          const parsed = JSON.parse(job.errors);
          errorsCount = Array.isArray(parsed) ? parsed.length : 0;
        } catch {
          errorsCount = 0;
        }
      }

      let durationMs = job.duration || 0;
      if (job.startedAt && job.completedAt) {
        durationMs = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
      }

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
        endpointsFound: job.endpointsFound,
        endpointsValidated: job.endpointsValidated,
        errors: errorsCount,
        durationMs,
      };
    });

    // Get all endpoints
    const endpoints = await db.apiEndpoint.findMany({
      orderBy: [{ priority: 'desc' }, { avgResponseMs: 'asc' }],
    });

    return NextResponse.json({
      scheduler: schedulerStatus,
      pool: poolStats,
      poolManager: poolManagerStats,
      recentJobs,
      endpoints,
    });
  } catch (err) {
    console.error('[Aggregator Status] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في تحميل حالة المُجمّع' },
      { status: 500 }
    );
  }
}
