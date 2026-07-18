/**
 * MCP Tool: SEO Keywords
 * فكرة من: Generate SEO Seed Keywords Using AI
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const seoKeywordsTool: MCPTool = {
  name: "seo_keywords",
  description: "ولّد كلمات مفتاحية SEO لموضوع. استخدمها لما المستخدم يقول 'SEO' أو 'كلمات مفتاحية' أو 'keywords'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "الموضوع/المنتج" },
      count: { type: "number", description: "عدد الكلمات (افتراضي: 20)", default: 20 },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const count = Number(params.count) || 20;
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const systemMsg = `ولّد ${count} كلمة مفتاحية SEO للموضوع: ${topic}

صنّفها:
- primary (5 كلمات رئيسية)
- secondary (10 كلمات ثانوية)  
- long-tail (5 عبارات طويلة)

رجّع JSON: {"primary": [...], "secondary": [...], "longTail": [...]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: topic,
        maxTokens: 1000,
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
