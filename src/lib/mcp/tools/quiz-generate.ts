/**
 * MCP Tool: Quiz Generator
 * فكرة من: various education templates
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const quizGeneratorTool: MCPTool = {
  name: "quiz_generate",
  description: "ولّد اختبار/أسئلة من موضوع. استخدمها لما المستخدم يقول 'اختبار' أو 'quiz' أو 'أسئلة'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع الاختبار" },
      count: { type: "number", description: "عدد الأسئلة (افتراضي: 5)", default: 5 },
      type: { type: "string", description: "نوع الأسئلة: mcq, truefalse, mixed", enum: ["mcq", "truefalse", "mixed"], default: "mcq" },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const count = Number(params.count) || 5;
    const type = String(params.type || "mcq");
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const systemMsg = `ولّد ${count} أسئلة (${type}) عن: ${topic}

رجّع JSON:
{"questions":[{"question":"","options":["A","B","C","D"],"answer":"","explanation":""}]}

بالعربي.`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: topic,
        maxTokens: 2000,
        temperature: 0.5,
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
