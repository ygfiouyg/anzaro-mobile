/**
 * MCP Tool: Toxicity / Content Moderation Checker
 * فكرة من: "Detect toxic language in Telegram messages"
 * بيحلل نص ويكشف لو فيه لغة سامة/مسيئة/عنصرية.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const toxicityCheckTool: MCPTool = {
  name: "toxicity_check",
  description: "حلل نص وكشف اللغة السامة/المسيئة. استخدمها لما المستخدم يقول 'toxicity' أو 'إساءة' أو 'مراقبة' أو 'فلترة'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للتحليل" },
      strictness: { type: "string", description: "درجة الصرامة: low, medium, high", default: "medium" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const strictness = String(params.strictness || "medium");
    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 10000) return { success: false, error: "النص طويل جداً (حد أقصى 10000 حرف)" };
    try {
      const systemMsg = `أنت نظام moderation للنصوص. حلّل النص ده واكشف:
- مستوى السمية الإجمالي (0-100)
- التصنيفات (toxic, hate, harassment, self_harm, sexual, violence, spam)
- اقتباسات من النص تبرر التصنيف
- توصية: allow, flag, block

درجة الصرامة: ${strictness} (low=تسامح عالي، high=zero tolerance).

رجّع JSON فقط:
{"overall_toxicity":0,"categories":[{"category":"","score":0,"evidence":""}],"recommendation":"","reason":"","flagged_phrases":[]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: text,
        maxTokens: 1500,
        temperature: 0.2,
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
