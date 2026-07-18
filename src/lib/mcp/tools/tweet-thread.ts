/**
 * MCP Tool: Tweet Thread Generator
 * فكرة من: AI Twitter thread / content templates
 * بيولّد thread كامل على X/Twitter من موضوع.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const tweetThreadTool: MCPTool = {
  name: "tweet_thread",
  description: "اكتب thread (سلسلة تغريدات) على X/Twitter. استخدمها لما المستخدم يقول 'thread' أو 'تغريدات' أو 'سلسلة'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع الـ thread" },
      tone: { type: "string", description: "النبرة: educational, storytelling, promotional, opinion", default: "educational" },
      count: { type: "number", description: "عدد التغريدات (افتراضي: 7)", default: 7 },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const tone = String(params.tone || "educational");
    const count = Number(params.count) || 7;
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const systemMsg = `أنت كاتب محتوى محترف على X/Twitter. اكتب thread من ${count} تغريدات عن: "${topic}".
النبرة: ${tone}.

القواعد:
- كل تغريدة أقصى 280 حرف
- التغريدة الأولى = hook قوي يجذب الانتباه
- التغريدة الأخيرة = خلاصة + call-to-action
- استخدم ترقيم (1/, 2/, 3/...)
- متناسق ومترابط

رجّع JSON فقط:
{"thread":[{"tweet":"1/ ...","number":1}],"estimated_read_time":"2 min"}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: topic,
        maxTokens: 2500,
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
