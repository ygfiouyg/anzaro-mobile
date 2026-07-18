import { NextResponse } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import {
  getHealthCheck,
  getMetricsSnapshot,
  getStatsSummary,
  runPeriodicHealthCheck,
} from '@/lib/system-monitor';

// ─── System Health & Metrics API ──────────────────────────────────────
// Provides health check summaries, metrics snapshots, and auto-healing

export async function GET(request: Request) {
  try {
    // Auth check - admin only for detailed metrics
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = token ? await getUserFromToken(token) : null;

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'غير مصرح - مطلوب صلاحيات الآدمن' },
        { status: 403 }
      );
    }

    const mode = new URL(request.url).searchParams.get('mode') || 'health';

    switch (mode) {
      case 'health':
        return NextResponse.json({
          health: getHealthCheck(),
        });

      case 'metrics':
        return NextResponse.json({
          metrics: getMetricsSnapshot(),
        });

      case 'stats':
        return NextResponse.json({
          stats: getStatsSummary(),
        });

      case 'check':
        return NextResponse.json({
          check: runPeriodicHealthCheck(),
        });

      default:
        return NextResponse.json(
          { error: 'الوضع غير صالح. استخدم: health, metrics, stats, check' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('System health API error:', error);
    return NextResponse.json(
      { error: 'خطأ في جلب حالة النظام' },
      { status: 500 }
    );
  }
}
