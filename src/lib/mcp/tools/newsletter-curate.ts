/**
 * MCP Tool: Newsletter Curator
 * فكرة من: "Daily Podcast Summary" + "Scrape and summarize news"
 * بيجمّع وي نسّق newsletter من محتوى/روابط.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const newsletterCurateTool: MCPTool = {
  name: "newsletter_curate",
  description: "جمّع ونسّق newsletter من محتوى. استخدمها لما المستخدم يقول 'newsletter' أو 'نشرة' أو 'تجميع محتوى'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع الـ newsletter" },
      content: { type: "string", description: "المحتوى/النصوص لتجميعها" },
      audience: { type: "string", description: "الجمهور: general, technical, business", default: "general" },
      sections: { type: "number", description: "عدد الأقسام (افتراضي: 4)", default: 4 },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const content = String(params.content || "");
    const audience = String(params.audience || "general");
    const sections = Number(params.sections) || 4;
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const systemMsg = `أنت محرر newsletter محترف. اصنع newsletter عن: "${topic}"
الجمهور: ${audience}. عدد الأقسام: ${sections}.
${content ? `المحتوى المتاح:\n${content.slice(0, 4000)}` : ""}

الـ newsletter لازم يحتوي على:
- عنوان جذاب
- مقدمة قصيرة (1-2 سطر)
- ${sections} أقسام رئيسية بـ highlights
- كل قسم: عنوان + 2-3 نقاط
- "quote of the day" أو insight
- call-to-action في الآخر

رجّع JSON فقط:
{"title":"","intro":"","sections":[{"heading":"","points":[],"read_time":""}],"quote":{"text":"","source":""},"cta":"","estimated_read_time":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: topic,
        maxTokens: 2500,
        temperature: 0.6,
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
