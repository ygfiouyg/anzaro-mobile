/**
 * POST /api/admin/agent
 * =====================
 * Admin Agent endpoint — بـ stream الرد + tool calls عبر SSE.
 *
 * محمي بـ withAuth({ requireAdmin: true }) — بس الأدمين يقدر يستخدمه.
 *
 * Request headers:
 *   Authorization: Bearer <session_token>
 *
 * Request body:
 *   {
 *     "messages": [{ "role": "user"|"assistant", "content": "..." }],
 *     "enableThinking": boolean
 *   }
 *
 * SSE events:
 *   { "type": "status", "message": "..." }
 *   { "type": "step", "step": 1 }
 *   { "type": "token", "content": "..." }
 *   { "type": "thinking", "content": "..." }
 *   { "type": "tool_start", "tool": "read_file", "args": {...} }
 *   { "type": "tool_end", "tool": "read_file", "result": "..." }
 *   { "type": "done", "content": "..." }
 *   { "type": "error", "error": "..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { orchestrateAdmin, type AdminMessage } from '@/lib/admin/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * الـ handler الفعلي — بيتنفذ بعد ما withAuth يتأكد إن المستخدم admin.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const messages: AdminMessage[] = body.messages ?? [];
    const enableThinking: boolean = body.enableThinking ?? false;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        send({ type: 'status', message: 'Admin Agent جاهز' });
        try {
          await orchestrateAdmin(messages, send, { enableThinking });
        } catch (e: any) {
          send({ type: 'error', error: e.message });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// تصدير الـ POST محمي بـ requireAdmin
export const POST = withAuth(handler, { requireAdmin: true });
