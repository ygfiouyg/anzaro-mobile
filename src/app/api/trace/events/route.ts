import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentEntries,
  addSSEClient,
  removeSSEClient,
  clearEntries,
  traceSystem,
} from '@/lib/trace-logger';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // ── FIX: Require admin authentication for trace events ──
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  const user = await getUserFromToken(token);

  if (!user || user.role !== 'admin') {
    return NextResponse.json(
      { error: 'يتطلب صلاحيات المسؤول' },
      { status: 403 }
    );
  }

  traceSystem('اتصال SSE جديد بلوحة التتبع');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const client = addSSEClient(controller, encoder);

      // Send initial history
      const history = getRecentEntries(50);
      try {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'history', entries: history })}\n\n`)
        );
      } catch {
        // Client disconnected immediately
        removeSSEClient(client);
        return;
      }

      // Heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
          removeSSEClient(client);
        }
      }, 15000);

      // Store cleanup function on the client for later use
      const clientWithCleanup = client as typeof client & { cleanup?: () => void };
      clientWithCleanup.cleanup = () => {
        clearInterval(heartbeat);
        removeSSEClient(client);
      };
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// DELETE to clear trace entries — admin only
export async function DELETE(request: NextRequest) {
  // ── FIX: Require admin authentication to delete trace entries ──
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  const user = await getUserFromToken(token);

  if (!user || user.role !== 'admin') {
    return NextResponse.json(
      { error: 'يتطلب صلاحيات المسؤول' },
      { status: 403 }
    );
  }

  clearEntries();
  traceSystem('تم مسح سجلات التتبع');
  return NextResponse.json({ success: true });
}
