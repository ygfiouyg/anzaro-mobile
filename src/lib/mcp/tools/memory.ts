/**
 * MCP Tool — Memory (Get + Set)
 * =============================
 * أداة ذاكرة بسيطة key-value (in-memory).
 * - memory_get: استرجاع قيمة مفتاح
 * - memory_set: حفظ قيمة لمفتاح
 *
 * استخدامها: تخزين سياق بين الـ tool calls في نفس الـ agent run.
 */
import type { MCPTool } from "../types";
import { mcpMemory } from "@/lib/ai-tools/mcp-tools";

export const memoryGetTool: MCPTool = {
  name: "memory_get",
  description:
    "Recall a value previously stored in memory by its key. Use this to retrieve context from earlier in the conversation.",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "The memory key to recall (e.g. 'user_name', 'last_topic').",
      },
    },
    required: ["key"],
  },
  async execute(params) {
    const key = String(params.key || "").trim();
    if (!key) {
      return { success: false, error: "key مطلوبة" };
    }

    const result = await mcpMemory("recall", key);
    return {
      success: result.success,
      data: { key, value: result.data },
      error: result.error,
    };
  },
};

export const memorySetTool: MCPTool = {
  name: "memory_set",
  description:
    "Save a value in memory under a key for later recall. Use this to persist context across multiple tool calls.",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "The memory key (e.g. 'user_preferences').",
      },
      value: {
        type: "string",
        description: "The value to store under the key.",
      },
    },
    required: ["key", "value"],
  },
  async execute(params) {
    const key = String(params.key || "").trim();
    const value = String(params.value ?? "").trim();

    if (!key) {
      return { success: false, error: "key مطلوبة" };
    }
    if (!value) {
      return { success: false, error: "value مطلوبة" };
    }

    const result = await mcpMemory("save", key, value);
    return {
      success: result.success,
      data: { key, saved: true, message: result.data },
      error: result.error,
    };
  },
};
