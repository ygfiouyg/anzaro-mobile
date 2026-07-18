import { NextResponse } from 'next/server';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { ensureAggregatorInitialized, isAggregatorInitialized } from '@/lib/api-aggregator/init';
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

    // Initialize the aggregator if not already initialized
    await ensureAggregatorInitialized();

    // Get pool stats
    const pool = await poolManager.getStats();

    return NextResponse.json({
      initialized: isAggregatorInitialized(),
      pool,
    });
  } catch (err) {
    console.error('[Aggregator Init] Error:', err);
    return NextResponse.json(
      { error: 'خطأ في تهيئة المُجمّع' },
      { status: 500 }
    );
  }
}
