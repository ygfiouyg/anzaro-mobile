/**
 * POST /api/ai/acp
 * Agent Communication Protocol (Project #99)
 * 
 * ACP enables agents to communicate with each other via structured messages.
 * This route acts as a message broker between agents.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ACPMessage {
  from: string;        // agent ID
  to: string;          // agent ID or "broadcast"
  type: 'request' | 'response' | 'notify' | 'error';
  action: string;      // e.g. "search", "analyze", "generate"
  payload: any;
  conversationId?: string;
  messageId?: string;
}

// In-memory message queue (use Redis in production)
const messageQueue: Map<string, ACPMessage[]> = new Map();

export async function POST(request: NextRequest) {
  try {
    const msg = await request.json() as ACPMessage;

    if (!msg.from || !msg.to || !msg.type) {
      return NextResponse.json({ error: 'from, to, type required' }, { status: 400 });
    }

    msg.messageId = msg.messageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    msg.conversationId = msg.conversationId || `conv-${Date.now()}`;

    // Route message
    if (msg.to === 'broadcast') {
      // Add to all agent queues
      for (const [agentId] of messageQueue) {
        if (agentId !== msg.from) {
          messageQueue.get(agentId)?.push(msg);
        }
      }
    } else {
      // Add to specific agent queue
      if (!messageQueue.has(msg.to)) {
        messageQueue.set(msg.to, []);
      }
      messageQueue.get(msg.to)!.push(msg);
    }

    return NextResponse.json({
      success: true,
      messageId: msg.messageId,
      conversationId: msg.conversationId,
      delivered: msg.to === 'broadcast' ? messageQueue.size - 1 : 1,
    });
  } catch (error) {
    return NextResponse.json({ error: 'ACP message failed' }, { status: 500 });
  }
}

// GET — poll for messages for an agent
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agentId');
  if (!agentId) {
    return NextResponse.json({ error: 'agentId required' }, { status: 400 });
  }

  const messages = messageQueue.get(agentId) || [];
  messageQueue.set(agentId, []); // Clear after read

  return NextResponse.json({
    agentId,
    messageCount: messages.length,
    messages,
  });
}
