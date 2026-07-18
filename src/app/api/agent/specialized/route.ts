/**
 * POST /api/agent/specialized
 * ===========================
 * تشغيل وكيل متخصص (Specialized Agent).
 *
 * الـ response SSE stream زي /api/agent بالظبط.
 *
 * Body:
 *   {
 *     "agentId":  string,           // required — content_creator | research_analyst | developer_helper
 *     "message":  string,           // required — user message
 *     "history"?: AgentMessage[],   // optional
 *     "maxIterations"?: number,     // optional — default 8
 *   }
 *
 * Headers:
 *   Authorization: Bearer <token>   // required
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { runAgent, type AgentMessage } from "@/lib/mcp/agent-engine";
import { getSpecializedAgent, listSpecializedAgents } from "@/lib/mcp/specialized-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SpecializedRequestBody {
  agentId?: string;
  message?: string;
  history?: AgentMessage[];
  maxIterations?: number;
}

// GET — قائمة الوكلاء المتخصصين
export const GET = withAuth(async () => {
  return NextResponse.json({ agents: listSpecializedAgents() });
});

export const POST = withAuth(async (request: NextRequest) => {
  let body: SpecializedRequestBody;
  try {
    body = (await request.json()) as SpecializedRequestBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "الـ body لازم يكون JSON صالح" },
      { status: 400 },
    );
  }

  const agentId = (body.agentId || "").trim();
  const message = (body.message || "").trim();

  if (!agentId) {
    return NextResponse.json(
      { error: "missing_agent_id", message: "agentId مطلوبة" },
      { status: 400 },
    );
  }
  if (!message) {
    return NextResponse.json(
      { error: "missing_message", message: "message مطلوبة" },
      { status: 400 },
    );
  }

  const agent = getSpecializedAgent(agentId);
  if (!agent) {
    return NextResponse.json(
      { error: "unknown_agent", message: `وكيل "${agentId}" غير موجود` },
      { status: 404 },
    );
  }

  const maxIterations = Math.max(1, Math.min(15, Number(body.maxIterations) || 8));

  const history: AgentMessage[] = Array.isArray(body.history)
    ? body.history
        .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
        .slice(-30)
        .map((m) => ({
          role: m.role,
          content: String(m.content).slice(0, 8000),
          ...(m.tool_call_id ? { tool_call_id: String(m.tool_call_id) } : {}),
          ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls } : {}),
        }))
    : [];

  // ── Build SSE stream ──
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // إرسال metadata الوكيل في أول event
      send({
        type: "agent_info",
        agentId: agent.id,
        agentName: agent.nameAr,
        tools: agent.tools,
      });

      try {
        // استخدم الموديل المختار، ولو مش متاح → fallback لـ glm-4-flash
        const { getSelectedModel } = await import("@/lib/model-selection");
        const modelSelection = getSelectedModel({ model: body.model });
        const agentModel = body.model || modelSelection.model;
        const maxTokens = modelSelection.maxTokens;

        for await (const event of runAgent({
          message,
          history,
          toolNames: agent.tools,
          maxIterations,
          model: agentModel,
          maxTokens,
          temperature: 0.7,
          systemPrompt: agent.systemPrompt,
        })) {
          send(event);
        }
      } catch (e: any) {
        send({ type: "error", message: e?.message || "specialized_agent_failed" });
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
});
