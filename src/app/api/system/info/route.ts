import { NextRequest, NextResponse } from 'next/server';
import { traceSystem } from '@/lib/trace-logger';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

const startTime = Date.now();

export async function GET(request: NextRequest) {
  try {
    // ── FIX: Require admin authentication for system info ──
    // Previously anyone could see Node.js version, memory, PID, etc.
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'يتطلب صلاحيات المسؤول' },
        { status: 403 }
      );
    }

    const uptime = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    const memoryUsage = process.memoryUsage();

    traceSystem('طلب معلومات النظام');

    return NextResponse.json({
      service: 'DeltaAI',
      version: '3.0.0',
      uptime: {
        ms: uptime,
        seconds: uptimeSeconds,
        minutes: uptimeMinutes,
        hours: uptimeHours,
        days: uptimeDays,
        formatted: `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`,
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        externalMB: Math.round(memoryUsage.external / 1024 / 1024),
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
      },
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'فشل في جلب معلومات النظام' },
      { status: 500 }
    );
  }
}
