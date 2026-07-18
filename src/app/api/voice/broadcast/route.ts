import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Try to fetch active broadcasts from database
    // If no VoiceBroadcast table exists, return empty broadcasts gracefully
    try {
      const broadcasts = await (db as any).voiceBroadcast?.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      if (broadcasts && broadcasts.length > 0) {
        return NextResponse.json({
          broadcasts,
          total: broadcasts.length,
        });
      }
    } catch {
      // Table might not exist yet — that's fine
    }

    // No active broadcasts
    return NextResponse.json({
      broadcasts: [],
      total: 0,
    });
  } catch (error) {
    console.error('[VoiceBroadcast] Error fetching broadcasts:', error);
    return NextResponse.json({
      broadcasts: [],
      total: 0,
    });
  }
}
