/**
 * GLM Orchestration Engine
 * ========================
 * The "brain" of the platform. Implements the ReAct-style orchestration loop:
 *
 *   user message
 *        │
 *        ▼
 *   ┌─────────────────────────────────────────┐
 *   │  GLM (with 60 tools advertised)         │
 *   └───────────────┬─────────────────────────┘
 *                   │ response (text OR tool_calls)
 *                   ▼
 *   ┌─────────────────────────────────────────┐
 *   │  Tool calls?  ── no  ──▶  stream final  │
 *   │      │ yes                               │
 *   │      ▼                                   │
 *   │  execute each tool via MCPClient         │
 *   │      │                                   │
 *   │      ▼                                   │
 *   │  feed results back to GLM  ◀── loop ────│
 *   └─────────────────────────────────────────┘
 *
 * Everything is streamed to the caller via Server-Sent Events (SSE):
 *   - "token"      : incremental text tokens from GLM
 *   - "tool_start" : a tool began executing
 *   - "tool_end"   : a tool finished (with result)
 *   - "thinking"   : GLM reasoning (if thinking enabled)
 *   - "done"       : orchestration complete
 *   - "error"      : unrecoverable error
 *
 * NOTE: The z-ai-web-dev-sdk returns a raw ReadableStream of SSE-formatted
 * text chunks when stream:true. We parse those manually below.
 */

import ZAI from "z-ai-web-dev-sdk";
import { getZAIClient } from "../zai-client";
import type { ChatMessage } from "z-ai-web-dev-sdk";
import { getMCPClient } from "../mcp/mcp-client";
import { ALL_TOOLS } from "../mcp/tools-registry";

export interface OrchestratorMessage extends ChatMessage {
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface SSEEvent {
  type: "token" | "tool_start" | "tool_end" | "thinking" | "done" | "error" | "step";
  content?: string;
  tool?: string;
  tool_call_id?: string;
  args?: unknown;
  result?: unknown;
  step?: number;
  error?: string;
}

export type SSESink = (event: SSEEvent) => void;

const MAX_ITERATIONS = 8; // safety cap on the orchestration loop

/**
 * Convert our MCP tool definitions into GLM's `tools` payload format.
 * This is the "mapping/bridging" step between MCP and GLM function-calling.
 */
function mcpToolsToGLM(tools = ALL_TOOLS) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * Parse a raw SSE-formatted chunk from the GLM stream.
 * Each chunk looks like: `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n`
 * The stream ends with `data: [DONE]`.
 */
function parseSSEChunk(text: string): any[] {
  const events: any[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      /* ignore malformed lines */
    }
  }
  return events;
}

/**
 * Run the full orchestration loop for a single user turn.
 */
export async function orchestrate(
  messages: OrchestratorMessage[],
  sink: SSESink,
  options: { enableThinking?: boolean; model?: string } = {},
): Promise<void> {
  const zai = await getZAIClient();
  const mcp = getMCPClient();
  const glmTools = mcpToolsToGLM(mcp.listAllTools());

  // Working copy of the conversation
  const conversation: OrchestratorMessage[] = [...messages];

  for (let step = 1; step <= MAX_ITERATIONS; step++) {
    sink({ type: "step", step });

    let assistantText = "";
    const toolCallsMap = new Map<number, ToolCall>();

    try {
      // Use streaming so we can emit tokens live
      const stream: ReadableStream<Uint8Array> = await zai.chat.completions.create({
        model: options.model ?? "glm-4-plus",
        messages: conversation as any,
        tools: glmTools as any,
        tool_choice: "auto",
        stream: true,
        thinking: options.enableThinking ? { type: "enabled" } : { type: "disabled" },
      } as any);

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        // Process complete lines (terminated by \n)
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? ""; // keep the last partial line
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]" || !payload) continue;
          let parsed: any;
          try { parsed = JSON.parse(payload); } catch { continue; }
          const delta = parsed?.choices?.[0]?.delta ?? {};
          // Reasoning / thinking
          if (delta.reasoning_content) {
            sink({ type: "thinking", content: delta.reasoning_content });
          }
          // Normal text token
          if (delta.content) {
            assistantText += delta.content;
            sink({ type: "token", content: delta.content });
          }
          // Tool calls (streamed in pieces, keyed by index)
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id ?? `call_${idx}_${Date.now()}`,
                  type: "function",
                  function: { name: "", arguments: "" },
                });
              }
              const existing = toolCallsMap.get(idx)!;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              if (tc.id && !existing.id.includes("call_")) existing.id = tc.id;
            }
          }
        }
      }
      // flush any trailing SSE data
      if (sseBuffer.trim().startsWith("data:")) {
        for (const ev of parseSSEChunk(sseBuffer)) {
          const delta = ev?.choices?.[0]?.delta ?? {};
          if (delta.content) { assistantText += delta.content; sink({ type: "token", content: delta.content }); }
        }
      }
    } catch (e: any) {
      sink({ type: "error", error: `GLM call failed: ${e.message}` });
      return;
    }

    const toolCalls = [...toolCallsMap.values()].filter((tc) => tc.function.name);

    // Append assistant message
    const assistantMessage: OrchestratorMessage = {
      role: "assistant",
      content: assistantText || "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    conversation.push(assistantMessage);

    // No tool calls? → final answer
    if (toolCalls.length === 0) {
      sink({ type: "done", content: assistantText });
      return;
    }

    // Execute each tool call
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        parsedArgs = { _raw: tc.function.arguments };
      }

      sink({ type: "tool_start", tool: toolName, tool_call_id: tc.id, args: parsedArgs });

      const result = await mcp.callTool(toolName, parsedArgs);

      sink({
        type: "tool_end",
        tool: toolName,
        tool_call_id: tc.id,
        result: result.success ? result.output : { error: result.error },
      });

      // Compose tool result message
      const resultText = typeof result.output === "string"
        ? result.output
        : JSON.stringify(result.output ?? { error: result.error }).slice(0, 12000);

      conversation.push({
        role: "tool",
        tool_call_id: tc.id,
        name: toolName,
        content: resultText,
      } as any);
    }
    // loop continues — GLM sees the tool results
  }

  sink({ type: "done", content: "Reached maximum orchestration steps." });
}

/**
 * Non-streaming convenience wrapper.
 */
export async function orchestrateSync(
  messages: OrchestratorMessage[],
  options?: { enableThinking?: boolean; model?: string },
): Promise<{ text: string; toolEvents: SSEEvent[] }> {
  let text = "";
  const toolEvents: SSEEvent[] = [];
  await orchestrate(messages, (e) => {
    if (e.type === "token") text += e.content ?? "";
    if (e.type === "tool_start" || e.type === "tool_end") toolEvents.push(e);
  }, options);
  return { text, toolEvents };
}
