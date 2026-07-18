/**
 * MCP Tool: Podcast Outline Generator
 * فكرة من: AI podcast / content planning templates
 * بيعمل outline لحلقة بودكاست من موضوع.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const podcastOutlineTool: MCPTool = {
  name: "podcast_outline",
  description: "اعمل outline لحلقة بودكاست. استخدمها لما المستخدم يقول 'بودكاست' أو 'podcast' أو 'حلقة صوتية'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع الحلقة" },
      duration: { type: "string", description: "مدة الحلقة: short (15min), medium (30min), long (60min)", default: "medium" },
      style: { type: "string", description: "أسلوب: solo, interview, co-host", default: "solo" },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const duration = String(params.duration || "medium");
    const style = String(params.style || "solo");
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const systemMsg = `أنت منتج بودكاست محترف. اعمل outline لحلقة عن: "${topic}".
المدة: ${duration}. الأسلوب: ${style}.

الـ outline لازم يحتوي على:
- عنوان جذاب للحلقة
- مقدمة (intro) مع hook
- 3-5 أقسام رئيسية بـ talking points
- نقاط للنقاش/أسئلة (لو interview)
- خاتمة (outro) مع call-to-action
- توقيت تقديري لكل قسم

رجّع JSON فقط:
{"title":"","episode_number":"","total_duration":"","sections":[{"section":"","duration":"","talking_points":[],"notes":""}]}`;

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
