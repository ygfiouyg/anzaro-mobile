/**
 * POST /api/agent
 * ===============
 * DeltaAI Agent endpoint — ReAct loop with GLM-5.2 function calling.
 *
 * الـ response بيرجع SSE stream من الأحداث:
 *   iteration_start | assistant_chunk | thinking | tool_call | tool_result
 *   final_answer | error | done
 *
 * Body:
 *   {
 *     "message":  string,           // required — user message
 *     "history"?: AgentMessage[],   // optional — prior conversation
 *     "tools"?:   string[],         // optional — restrict tool names
 *     "maxIterations"?: number,     // optional — default 8
 *     "model"?:   string,           // optional — default glm-5.2
 *     "temperature"?: number        // optional — default 0.7
 *   }
 *
 * Headers:
 *   Authorization: Bearer <token>   // required
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { runAgent, type AgentMessage } from "@/lib/mcp/agent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgentRequestBody {
  message?: string;
  history?: AgentMessage[];
  tools?: string[];
  maxIterations?: number;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

export const POST = withAuth(async (request: NextRequest) => {
  // ── Parse body ──
  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "الـ body لازم يكون JSON صالح" },
      { status: 400 },
    );
  }

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "missing_message", message: "message مطلوبة" },
      { status: 400 },
    );
  }

  // Cap iterations to a safe upper bound
  const maxIterations = Math.max(1, Math.min(15, Number(body.maxIterations) || 8));

  // Sanitize history
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

      try {
        // استخدم الموديل المختار، ولو مش متاح → fallback لـ glm-4-flash (ZAI)
        const { getSelectedModel } = await import("@/lib/model-selection");
        const modelSelection = getSelectedModel({ model: body.model });
        const agentModel = body.model || modelSelection.model;
        const maxTokens = modelSelection.maxTokens;

        for await (const event of runAgent({
          message,
          history,
          toolNames: Array.isArray(body.tools) ? body.tools : undefined,
          maxIterations,
          model: agentModel,
          maxTokens,
          temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
          systemPrompt: body.systemPrompt,
        })) {
          send(event);
        }
      } catch (e: any) {
        send({ type: "error", message: e?.message || "agent_run_failed" });
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
