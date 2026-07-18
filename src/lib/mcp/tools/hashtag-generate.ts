/**
 * MCP Tool: Hashtag Generator
 * فكرة من: various social media templates
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const hashtagGeneratorTool: MCPTool = {
  name: "hashtag_generate",
  description: "ولّد hashtags لموضوع/منصة. استخدمها لما المستخدم يقول 'hashtags' أو 'هاشتاج'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "الموضوع" },
      platform: { type: "string", description: "المنصة: instagram, tiktok, twitter, linkedin", default: "instagram" },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const platform = String(params.platform || "instagram");
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const counts: Record<string, number> = { instagram: 30, tiktok: 15, twitter: 5, linkedin: 10 };
      const num = counts[platform] || 20;
      const systemMsg = `ولّد ${num} hashtags عن "${topic}" لـ${platform}.

صنّفها:
- trending (شائعة)
- niche (متخصصة)
- branded (علامة تجارية)

رجّع JSON: {"trending":[],"niche":[],"branded":[],"all":[]}`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: topic,
        maxTokens: 1000,
        temperature: 0.6,
      });
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
