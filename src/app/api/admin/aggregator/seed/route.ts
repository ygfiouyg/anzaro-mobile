import { NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { getKnownEndpoints } from '@/lib/api-aggregator/sources';
import { poolManager } from '@/lib/api-aggregator/pool-manager';

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

    const knownEndpoints = getKnownEndpoints();
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const ep of knownEndpoints) {
      try {
        const existing = await db.apiEndpoint.findFirst({
          where: {
            baseUrl: ep.baseUrl,
            modelId: ep.modelId ?? null,
          },
        });

        // An endpoint is available only if:
        // - authType === 'none' (no auth needed), OR
        // - It has a non-empty apiKey
        const isAvailable = ep.authType === 'none' || !!ep.apiKey;

        if (existing) {
          // Update existing — including authType, apiKey, apiFormat, isAvailable
          await db.apiEndpoint.update({
            where: { id: existing.id },
            data: {
              name: ep.name,
              provider: ep.provider,
              category: ep.category,
              authType: ep.authType,
              apiKey: ep.apiKey,
              authHeader: ep.authHeader,
              apiFormat: ep.apiFormat,
              isAvailable,
              isFree: ep.isFree,
              sourceRepo: ep.sourceRepo,
              sourceUrl: ep.sourceUrl,
              capabilities: ep.capabilities ? JSON.stringify(ep.capabilities) : existing.capabilities,
              metadata: ep.metadata ? JSON.stringify(ep.metadata) : existing.metadata,
            },
          });
          updated++;
        } else {
          // Create new
          await db.apiEndpoint.create({
            data: {
              name: ep.name,
              provider: ep.provider,
              category: ep.category,
              baseUrl: ep.baseUrl,
              modelId: ep.modelId,
              apiKey: ep.apiKey,
              authType: ep.authType,
              authHeader: ep.authHeader,
              apiFormat: ep.apiFormat,
              isFree: ep.isFree,
              isAvailable,
              sourceRepo: ep.sourceRepo,
              sourceUrl: ep.sourceUrl,
              capabilities: ep.capabilities ? JSON.stringify(ep.capabilities) : undefined,
              metadata: ep.metadata ? JSON.stringify(ep.metadata) : undefined,
            },
          });
          added++;
        }
      } catch (err) {
        console.error(`[Aggregator Seed] Error seeding ${ep.name}:`, err);
        errors++;
      }
    }

    // Invalidate pool cache after seeding
    await poolManager.invalidateCache();

    // Create a job record for tracking
    const job = await db.apiAggregationJob.create({
      data: {
        type: 'scrape',
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        endpointsFound: knownEndpoints.length,
        endpointsAdded: added,
        duration: 0,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      message: 'تم تحديث نقاط النهاية بنجاح',
      summary: {
        total: knownEndpoints.length,
        added,
        updated,
        skipped,
        errors,
      },
    });
  } catch (err) {
    console.error('[Aggregator Seed] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في بذر نقاط النهاية' },
      { status: 500 }
    );
  }
}
