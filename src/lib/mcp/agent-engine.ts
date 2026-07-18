/**
 * Agent Engine — ReAct Loop with GLM Function Calling + SSE
 * =========================================================
 *
 * بياخد رسالة المستخدم + قائمة tools، ويشغّل ReAct loop:
 *   1. يبعت الـ messages لـ GLM-5.2 مع tools (function calling).
 *   2. لو GLM رجّع tool_calls → ينفذهم (parallel) ويضيف results للـ messages.
 *   3. لو GLM رجّع final answer (no tool_calls) → يبعتها وينهي.
 *   4. يتكرر لحد max 8 iterations أو وصول لـ final answer.
 *
 * كل خطوة بتنبعث كـ SSE event عبر async generator.
 *
 * Usage:
 *   for await (const event of runAgent({ message, tools, history })) {
 *     // event.type ∈ {iteration_start, assistant_chunk, thinking, tool_call,
 *     //                tool_result, final_answer, error, done}
 *   }
 */

import { getZAIClient } from "@/lib/zai-client";
import { streamHFChatCompletion, HF_API_TOKEN } from "@/lib/hf-chat.service";
import { listTools, getTool, toGLMTools, executeTool } from "./registry";
import type { MCPTool } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface AgentRunOptions {
  /** User's message for this run */
  message: string;
  /** Prior conversation history (system + user + assistant). Optional. */
  history?: AgentMessage[];
  /** Names of tools to expose. If omitted, exposes all 19 tools. */
  toolNames?: string[];
  /** Max ReAct iterations. Default 8. */
  maxIterations?: number;
  /** GLM model. Default glm-5.2. */
  model?: string;
  /** Temperature. Default 0.7. */
  temperature?: number;
  /** System prompt prepended. Optional override. */
  systemPrompt?: string;
}

export type AgentSSEEvent =
  | { type: "iteration_start"; iteration: number; max: number }
  | { type: "assistant_chunk"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; tool: string; args: unknown; callId: string; iteration: number }
  | { type: "tool_result"; tool: string; callId: string; success: boolean; data?: unknown; error?: string; durationMs: number }
  | { type: "final_answer"; content: string; iterations: number; toolCalls: number }
  | { type: "error"; message: string; iteration?: number }
  | { type: "done"; iterations: number; toolCalls: number; final: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Default system prompt (ReAct)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `أنت DeltaAI Agent — مساعد ذكي بيستخدم أدوات (tools) لحل مهام المستخدم المعقدة.

إليك طريقة عملك:
1. حلّل طلب المستخدم بدقة.
2. لو محتاج معلومات أو فعل خارجي → استدعِ الأداة المناسبة (tool_calls).
3. بناءً على نتائج الأدوات، إما استدعِ أداة تانية أو اكتب الإجابة النهائية.
4. الإجابة النهائية لازم تكون واضحة ومنظّمة وبالعربية (إلا لو المستخدم طلب لغة تانية).

قواعد:
- استخدم الأدوات بكفاءة — لا تستدعي أداة إلا لو محتاجها فعلاً.
- لو الأداة فشلت، جرّب بديل أو وضّح للمستخدم.
- لا تخترع معلومات — استخدم web_search أو page_read لو محتاج معلومات حديثة.
- إجاباتك النهائية يجب أن تكون قصيرة ومفيدة وبلغة المستخدم.`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveTools(toolNames?: string[]) {
  const all = listTools();
  if (!toolNames || toolNames.length === 0) return all;
  return all.filter((t) => toolNames.includes(t.name));
}

function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

async function executeToolCall(
  toolName: string,
  args: unknown,
): Promise<{ success: boolean; data?: unknown; error?: string; durationMs: number }> {
  const start = Date.now();
  const result = await executeTool(toolName, args as Record<string, unknown>);
  return {
    success: result.success,
    data: result.data,
    error: result.error,
    durationMs: Date.now() - start,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: async generator yielding SSE events
// ─────────────────────────────────────────────────────────────────────────────

export async function* runAgent(opts: AgentRunOptions): AsyncGenerator<AgentSSEEvent> {
  const {
    message,
    history = [],
    toolNames,
    maxIterations = 8,
    model = "glm-5.2",
    temperature = 0.7,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
  } = opts;

  // Build initial messages
  const messages: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  // Resolve tools + convert to GLM function schema
  const tools = resolveTools(toolNames);
  const glmTools = await toGLMTools();

  let client: any;
  let useHF = false;
  try {
    // Priority 1: HuggingFace Inference Providers (مجاني — GLM-5.2)
    if (HF_API_TOKEN) {
      useHF = true;
    } else {
      client = await getZAIClient();
    }
  } catch (e: any) {
    yield { type: "error", message: `Client init failed: ${e.message}` };
    yield { type: "done", iterations: 0, toolCalls: 0, final: false };
    return;
  }

  let iteration = 0;
  let totalToolCalls = 0;
  let finalAnswer: string | null = null;

  while (iteration < maxIterations) {
    iteration++;
    yield { type: "iteration_start", iteration, max: maxIterations };

    let completion: any;
    try {
      if (useHF) {
        // HuggingFace Inference Providers (مجاني — GLM-5.2)
        const hfModel = model.startsWith("zai-org/") ? model : "zai-org/GLM-5.2";
        // Non-streaming: collect all chunks (max_tokens 8192 عشان GLM-5.2 reasoning model)
        let fullContent = "";
        for await (const chunk of streamHFChatCompletion(messages, hfModel, { max_tokens: 260000 })) {
          fullContent += chunk;
        }
        completion = {
          choices: [{
            message: { role: "assistant", content: fullContent },
            finish_reason: "stop",
          }],
        };
      } else {
        const request: any = {
          model,
          messages,
          temperature,
          max_tokens: 260000,
        };
        if (glmTools.length > 0) {
          request.tools = glmTools;
          request.tool_choice = "auto";
        }
        completion = await client.chat.completions.create(request);
      }
    } catch (e: any) {
      yield { type: "error", message: `GLM API error: ${e.message}`, iteration };
      yield { type: "done", iterations: iteration, toolCalls: totalToolCalls, final: false };
      return;
    }

    // Extract choice (handle both streaming and non-streaming shapes)
    const choice = completion?.choices?.[0] || (completion as any)?.message ? completion : null;
    const msg: any = choice?.message ?? choice?.choices?.[0]?.message ?? (completion as any)?.message;
    if (!msg) {
      yield { type: "error", message: "GLM رجّع استجابة بدون message", iteration };
      yield { type: "done", iterations: iteration, toolCalls: totalToolCalls, final: false };
      return;
    }

    // Stream any content chunks to the client (assistant text)
    const content: string = typeof msg.content === "string" ? msg.content : "";
    if (content) {
      yield { type: "assistant_chunk", content };
    }

    // Handle thinking content if present
    if (msg.thinking) {
      const t = typeof msg.thinking === "string" ? msg.thinking : JSON.stringify(msg.thinking);
      yield { type: "thinking", content: t };
    }

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    // ── No tool calls → final answer ──
    if (toolCalls.length === 0) {
      finalAnswer = content || "(لا توجد إجابة)";
      // Append assistant message to history (for completeness)
      messages.push({ role: "assistant", content });
      yield {
        type: "final_answer",
        content: finalAnswer,
        iterations: iteration,
        toolCalls: totalToolCalls,
      };
      yield { type: "done", iterations: iteration, toolCalls: totalToolCalls, final: true };
      return;
    }

    // ── Has tool calls → execute them and feed results back ──
    // Append assistant message (with tool_calls) to history
    messages.push({
      role: "assistant",
      content: content || "",
      tool_calls: toolCalls.map((tc: any) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function?.name || "",
          arguments: tc.function?.arguments || "{}",
        },
      })),
    });

    // Parse all tool calls first (synchronous) so we can emit tool_call events immediately
    const parsed: Array<{ toolName: string; args: unknown; callId: string; argsRaw: string }> =
      toolCalls.map((tc: any) => {
        const toolName: string = tc.function?.name || "";
        const argsRaw: string = tc.function?.arguments || "{}";
        const args = safeParseArgs(argsRaw);
        const callId: string = tc.id || `${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return { toolName, args, callId, argsRaw };
      });

    // Emit tool_call events (sequentially, before execution)
    for (const r of parsed) {
      totalToolCalls++;
      yield {
        type: "tool_call",
        tool: r.toolName,
        args: r.args,
        callId: r.callId,
        iteration,
      };
    }

    // Execute all tool calls in parallel and emit tool_result events
    const execResults = await Promise.all(
      parsed.map(async (r) => {
        const exec = await executeToolCall(r.toolName, r.args);
        return { ...r, ...exec };
      }),
    );

    for (const er of execResults) {
      // Append the tool result message to history (GLM expects role=tool with tool_call_id)
      messages.push({
        role: "tool",
        content: JSON.stringify({
          success: er.success,
          data: er.data,
          error: er.error,
        }).slice(0, 8000),
        tool_call_id: er.callId,
      });

      yield {
        type: "tool_result",
        tool: er.toolName,
        callId: er.callId,
        success: er.success,
        data: er.data,
        error: er.error,
        durationMs: er.durationMs,
      };
    }
  }

  // ── Reached max iterations without a final answer ──
  if (finalAnswer === null) {
    yield {
      type: "final_answer",
      content: `وصلت للحد الأقصى من التكرارات (${maxIterations}) بدون إجابة نهائية. حاولت ${totalToolCalls} استدعاء أداة. رجاءً أعد صياغة طلبك أو قسّمه لمهام أصغر.`,
      iterations: iteration,
      toolCalls: totalToolCalls,
    };
  }
  yield { type: "done", iterations: iteration, toolCalls: totalToolCalls, final: finalAnswer !== null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: collect all events into an array (for non-streaming callers)
// ─────────────────────────────────────────────────────────────────────────────

export async function runAgentCollect(opts: AgentRunOptions): Promise<{
  events: AgentSSEEvent[];
  finalAnswer: string | null;
  iterations: number;
  toolCalls: number;
}> {
  const events: AgentSSEEvent[] = [];
  let finalAnswer: string | null = null;
  let iterations = 0;
  let toolCalls = 0;

  for await (const event of runAgent(opts)) {
    events.push(event);
    if (event.type === "final_answer") {
      finalAnswer = event.content;
      iterations = event.iterations;
      toolCalls = event.toolCalls;
    }
    if (event.type === "done") {
      iterations = event.iterations;
      toolCalls = event.toolCalls;
    }
  }

  return { events, finalAnswer, iterations, toolCalls };
}
