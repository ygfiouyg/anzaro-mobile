import { NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { validateEndpoint } from '@/lib/api-aggregator/validator';

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
    const { endpointId } = body;

    if (endpointId) {
      // ── Single endpoint validation ──
      const endpoint = await db.apiEndpoint.findUnique({
        where: { id: endpointId },
      });

      if (!endpoint) {
        return NextResponse.json(
          { error: 'نقطة النهاية غير موجودة' },
          { status: 404 }
        );
      }

      // Create a validation job
      const job = await db.apiAggregationJob.create({
        data: {
          type: 'validate',
          status: 'pending',
        },
      });

      // Run validation asynchronously (fire-and-forget)
      // validateEndpoint() already writes to DB internally (saveValidationLog + updateEndpointStats)
      // We only update the job status here
      validateEndpoint(endpoint)
        .then(async (result) => {
          await db.apiAggregationJob.update({
            where: { id: job.id },
            data: {
              status: 'completed',
              startedAt: new Date(),
              completedAt: new Date(),
              endpointsValidated: 1,
              endpointsFound: 1,
              errors: result.errorMessage ? JSON.stringify([result.errorMessage]) : null,
              duration: result.responseMs,
            },
          });
        })
        .catch(async (err) => {
          await db.apiAggregationJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              startedAt: new Date(),
              completedAt: new Date(),
              errors: JSON.stringify([err instanceof Error ? err.message : 'خطأ غير معروف']),
            },
          });
        });

      return NextResponse.json({
        jobId: job.id,
        endpointId,
        status: 'pending',
      });
    } else {
      // ── Bulk validation — validate all available endpoints ──
      const endpoints = await db.apiEndpoint.findMany({
        where: { isAvailable: true },
        select: { id: true },
      });

      if (endpoints.length === 0) {
        return NextResponse.json(
          { error: 'لا توجد نقاط نهاية متاحة للتحقق' },
          { status: 400 }
        );
      }

      // Create a validation job
      const job = await db.apiAggregationJob.create({
        data: {
          type: 'validate',
          status: 'pending',
          endpointsFound: endpoints.length,
        },
      });

      // Run in background in batches of 5
      const batchSize = 5;

      // جلب بيانات نقاط النهاية الكاملة للتحقق
      const allEndpoints = await db.apiEndpoint.findMany({
        where: { isAvailable: true },
      });

      (async () => {
        const startTime = Date.now();
        let validated = 0;
        const errors: string[] = [];

        await db.apiAggregationJob.update({
          where: { id: job.id },
          data: { status: 'running', startedAt: new Date() },
        });

        for (let i = 0; i < allEndpoints.length; i += batchSize) {
          const batch = allEndpoints.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map((ep) => validateEndpoint(ep))
          );

          for (const r of results) {
            if (r.status === 'fulfilled') {
              validated++;
              if (r.value.errorMessage) {
                errors.push(r.value.errorMessage);
              }
            } else {
              errors.push(`خطأ في التحقق: ${r.reason?.message || 'غير معروف'}`);
            }
          }
        }

        await db.apiAggregationJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            endpointsValidated: validated,
            duration: Date.now() - startTime,
            errors: errors.length > 0 ? JSON.stringify(errors) : null,
          },
        });
      })().catch(async (err) => {
        await db.apiAggregationJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errors: JSON.stringify([err instanceof Error ? err.message : 'خطأ غير معروف']),
          },
        });
      });

      return NextResponse.json({
        jobId: job.id,
        status: 'pending',
      });
    }
  } catch (err) {
    console.error('[Aggregator Validate] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في التحقق من نقاط النهاية' },
      { status: 500 }
    );
  }
}
