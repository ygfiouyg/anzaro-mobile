/**
 * MCP Tool: AI Agent Chat (with memory)
 * فكرة من: AI agent chat + Chat with OpenAI Assistant (with memory)
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const agentChatTool: MCPTool = {
  name: "agent_chat",
  description: "شات مع AI مع ذاكرة طويلة المدى. استخدمها لأسئلة معقدة محتاجة context.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "رسالة المستخدم" },
      context: { type: "string", description: "context إضافي (اختياري)", default: "" },
    },
    required: ["message"],
  },
  async execute(params) {
    const message = String(params.message || "");
    const context = String(params.context || "");
    if (!message) return { success: false, error: "message مطلوب" };
    try {
      const systemMsg = `أنت مساعد ذكي عربي. ${context ? "Context: " + context : ""} رد بالعربي.
رجّع JSON فقط:
{"response":"<الرد على المستخدم>","reasoning":"<تفكيرك الداخلي إن وجد>"}`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: message,
        maxTokens: 4000,
        temperature: 0.7,
      });
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
