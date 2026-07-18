/**
 * MCP Tool: Content Repurpose
 * ============================
 * فكرة من: FlowScribe - Content Repurposing 4 Platforms
 * يحول محتوى واحد لـ 4 منصات مختلفة
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const contentRepurposeTool: MCPTool = {
  name: "content_repurpose",
  description: "حوّل محتوى واحد لـ 4 منصات (تويتر، إنستجرام، لينكدإن، فيسبوك). استخدمها لما المستخدم يقول 'repurpose' أو 'نشر على كل المنصات'.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "المحتوى الأصلي" },
    },
    required: ["content"],
  },
  async execute(params) {
    const content = String(params.content || "");
    if (!content) return { success: false, error: "content مطلوب" };
    try {
      const systemMsg = `حوّل المحتوى التالي لـ 4 منصات. رجّع JSON:

{
  "twitter": "280 حرف max + 2 hashtags",
  "instagram": "caption جذاب + emojis + 10 hashtags",
  "linkedin": "professional post + question",
  "facebook": "storytelling style + CTA"
}

بالعربي.`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: content.slice(0, 5000),
        maxTokens: 2000,
        temperature: 0.7,
      });
      if (result.success) {
        return { success: true, data: { original: content.slice(0, 200), ...result.data } };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
