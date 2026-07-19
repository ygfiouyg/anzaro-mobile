/**
 * Agent Orchestrator — ReAct Loop with SSE
 * =========================================
 * بياخد: agent (system prompt + tools) + user message + history
 * ويعمل loop:
 *   1. يبعت messages لـ GLM-4.6-Air مع tools (function calling)
 *   2. لو GLM رجّع tool_calls → ينفذهم (parallel) ويرجّع results
 *   3. لو GLM رجّع final answer (no tool_calls) → يبعتها وينهي
 *   4. يتكرر لحد max 8 iterations
 *
 * كل خطوة بتنبعث كـ SSE event للواجهة.
 */

import ZAI from "z-ai-web-dev-sdk";
import { getZAIClient } from "../zai-client";
import type { ChatMessage } from "z-ai-web-dev-sdk";
import { toolsToGLMSchemaAsync } from "./catalog";
import { executeAgentTool, incrementAgentRunCount, type ToolResult } from "./executor";

export interface AgentRunMessage extends ChatMessage {
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AgentSSEEvent {
  type: "status" | "step" | "token" | "thinking" | "tool_start" | "tool_end" | "done" | "error";
  content?: string;
  tool?: string;
  tool_call_id?: string;
  args?: unknown;
  result?: unknown;
  step?: number;
  error?: string;
  message?: string;
}

export type AgentSSESink = (event: AgentSSEEvent) => void;

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  tools: string[]; // tool names
}

export interface RunOptions {
  enableThinking?: boolean;
  maxIterations?: number;
}

const MAX_ITERATIONS = 8;

const BASE_BEHAVIOR_PROMPT = `

قواعد العمل (ReAct):
1. فكّر في طلب المستخدم قبل ما تختار أداة.
2. لو محتاج معلومة أو فعل → استدعِ الأداة المناسبة (tool_calls).
3. بناءً على نتيجة الأداة، إما استدعِ أداة تانية أو اكتب الإجابة النهائية.
4. الإجابة النهائية لازم تكون واضحة ومنظّمة وبالعربية (إلا لو المستخدم طلب لغة تانية).
5. لا تخترع معلومات — استخدم web_search أو wikipedia_search لو محتاج معلومات حقيقية.
6. لو الأداة رجّعت "_passthrough: true"، ده معناه إنك إنت اللي تكتب الـ output النهائي بناءً على args.
7. لا تكرر استدعاء نفس الأداة بنفس الـ args — لو محتاج نتيجة مختلفة غيّر الـ args.`;

/**
 * تشغيل وكيل مخصص لحل رسالة مستخدم واحدة.
 */
export async function orchestrateAgent(
  agent: AgentConfig,
  messages: AgentRunMessage[],
  sink: AgentSSESink,
  options: RunOptions = {},
): Promise<void> {
  const maxIter = Math.max(1, Math.min(MAX_ITERATIONS, options.maxIterations ?? MAX_ITERATIONS));

  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await getZAIClient();
  } catch (e: any) {
    sink({ type: "error", error: `ZAI init failed: ${e.message}` });
    return;
  }

  // Build the tool schema for GLM (async — loads MCP tools lazily)
  const glmTools = await toolsToGLMSchemaAsync(agent.tools);
  if (glmTools.length === 0) {
    sink({ type: "status", message: "⚠️ هذا الوكيل لا يملك أي أدوات — سيعمل كنموذج محادثة عادي." });
  } else {
    sink({ type: "status", message: `🛠️ الوكيل جاهز مع ${glmTools.length} أداة.` });
  }

  // Build conversation
  const systemContent = agent.systemPrompt + BASE_BEHAVIOR_PROMPT;
  const conversation: AgentRunMessage[] = [
    { role: "system", content: systemContent },
    ...messages,
  ];

  let totalToolCalls = 0;

  for (let step = 1; step <= maxIter; step++) {
    sink({ type: "step", step });

    let assistantText = "";
    const toolCallsMap = new Map<number, ToolCall>();

    try {
      const request: any = {
        model: "glm-5.2",
        messages: conversation as any,
        stream: true,
        thinking: options.enableThinking ? { type: "enabled" } : { type: "disabled" },
      };
      if (glmTools.length > 0) {
        request.tools = glmTools as any;
        request.tool_choice = "auto";
      }

      const stream: ReadableStream<Uint8Array> = await zai.chat.completions.create(request);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]" || !payload) continue;
          let parsed: any;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = parsed?.choices?.[0]?.delta ?? {};
          if (delta.reasoning_content) {
            sink({ type: "thinking", content: delta.reasoning_content });
          }
          if (delta.content) {
            assistantText += delta.content;
            sink({ type: "token", content: delta.content });
          }
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
              if (tc.id) existing.id = tc.id;
            }
          }
        }
      }
    } catch (e: any) {
      sink({ type: "error", error: `GLM call failed: ${e.message}` });
      return;
    }

    const toolCalls = [...toolCallsMap.values()].filter((tc) => tc.function.name);

    // Append assistant message
    const assistantMessage: AgentRunMessage = {
      role: "assistant",
      content: assistantText || "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    conversation.push(assistantMessage);

    // No tool calls → final answer
    if (toolCalls.length === 0) {
      sink({ type: "done", content: assistantText });
      await incrementAgentRunCount(agent.id);
      return;
    }

    // Execute each tool call sequentially (so the UI sees them in order)
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        parsedArgs = { _raw: tc.function.arguments };
      }

      sink({ type: "tool_start", tool: toolName, tool_call_id: tc.id, args: parsedArgs });
      totalToolCalls++;

      const result: ToolResult = await executeAgentTool(toolName, parsedArgs);

      sink({
        type: "tool_end",
        tool: toolName,
        tool_call_id: tc.id,
        result: result.success ? result.output : { error: result.error },
      });

      // Compose tool result message for GLM (cap size)
      let resultText: string;
      if (typeof result.output === "string") {
        resultText = result.output.slice(0, 8000);
      } else {
        resultText = JSON.stringify(result.output ?? { error: result.error }).slice(0, 8000);
      }

      conversation.push({
        role: "tool",
        tool_call_id: tc.id,
        name: toolName,
        content: resultText,
      } as any);
    }
    // continue loop
  }

  // Reached max iterations
  sink({
    type: "done",
    content: `⏱️ وصلت للحد الأقصى من التكرارات (${maxIter}) بعد ${totalToolCalls} استدعاء أداة. حاول ت subdivisions طلبك لمهام أصغر.`,
  });
  await incrementAgentRunCount(agent.id);
}
