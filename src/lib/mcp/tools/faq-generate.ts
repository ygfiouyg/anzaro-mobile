/**
 * MCP Tool: FAQ Generator
 * فكرة من: AI FAQ / customer support templates
 * بيولّد قسم أسئلة شائعة (FAQ) من موضوع أو محتوى.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const faqGeneratorTool: MCPTool = {
  name: "faq_generate",
  description: "ولّد أسئلة شائعة (FAQ) من موضوع. استخدمها لما المستخدم يقول 'FAQ' أو 'أسئلة شائعة' أو 'سؤال وجواب'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "الموضوع أو المنتج" },
      count: { type: "number", description: "عدد الأسئلة (افتراضي: 8)", default: 8 },
      context: { type: "string", description: "سياق إضافي أو محتوى (اختياري)" },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const count = Number(params.count) || 8;
    const context = String(params.context || "");
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const systemMsg = `أنت خبير في خدمة العملاء. ولّد ${count} أسئلة شائعة (FAQ) عن: "${topic}".
${context ? `السياق الإضافي:\n${context}\n` : ""}
كل سؤال لازم يكون عملي وشائع، والإجابة واضحة ومختصرة (2-4 أسطر).

رجّع JSON فقط:
{"faqs":[{"question":"","answer":""}]}

بالعربي.`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: topic,
        maxTokens: 2500,
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
