/**
 * POST /api/agents/[id]/run
 * ==========================
 * يشغّل وكيل مخصص على رسالة مستخدم. الـ response SSE stream.
 *
 * Body:
 *   {
 *     "message":  string,                  // required — user message
 *     "history"?: [{role, content}],       // optional — prior conversation
 *     "enableThinking"?: boolean           // default false
 *   }
 *
 * SSE events:
 *   { type: "status", message: string }
 *   { type: "step", step: number }
 *   { type: "token", content: string }
 *   { type: "thinking", content: string }
 *   { type: "tool_start", tool, tool_call_id, args }
 *   { type: "tool_end", tool, tool_call_id, result }
 *   { type: "done", content }
 *   { type: "error", error }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, type AuthContext } from "@/lib/with-auth";
import { orchestrateAgent, type AgentRunMessage } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (req: NextRequest, { params }: Params) => {
  try {
    const { id } = await params;
    const body = await req.json();

    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json(
        { error: "missing_message", message: "message مطلوبة" },
        { status: 400 },
      );
    }

    // Load agent from DB
    const agentRow = await db.customAgent.findUnique({ where: { id } });
    if (!agentRow) {
      return NextResponse.json(
        { error: "not_found", message: "الوكيل غير موجود" },
        { status: 404 },
      );
    }

    const tools = JSON.parse(agentRow.toolsJson || "[]") as string[];
    if (tools.length === 0) {
      return NextResponse.json(
        { error: "no_tools", message: "الوكيل لا يملك أي أدوات" },
        { status: 400 },
      );
    }

    const enableThinking = Boolean(body.enableThinking);

    // Sanitize history
    const history: AgentRunMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((m: any) => m && typeof m.role === "string" && typeof m.content === "string")
          .slice(-20)
          .map((m: any) => ({
            role: m.role,
            content: String(m.content).slice(0, 6000),
          }))
      : [];

    // Build the agent config
    const agentConfig = {
      id: agentRow.id,
      name: agentRow.name,
      systemPrompt: agentRow.systemPrompt,
      tools,
    };

    // Build the messages (history + new user message)
    const messages: AgentRunMessage[] = [
      ...history,
      { role: "user", content: message },
    ];

    // ── Build SSE stream ─────────────────────────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        // Send agent metadata as first event
        send({
          type: "status",
          message: `🤖 وكيل "${agentRow.name}" بدأ التشغيل...`,
        });

        try {
          await orchestrateAgent(agentConfig, messages, send, { enableThinking });
        } catch (e: any) {
          send({ type: "error", error: e.message || "agent_run_failed" });
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "run_failed", message: e.message },
      { status: 500 },
    );
  }
});
