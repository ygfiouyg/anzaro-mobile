/**
 * MCP Tool: Social Media Caption
 * ===============================
 * فكرة من: AI Social Media Caption Creator
 * يكتب captions لمنصة معينة
 */

import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const socialCaptionTool: MCPTool = {
  name: "social_caption",
  description: "اكتب caption لسوشيال ميديا (إنستجرام/تويتر/فيسبوك/لينكدإن). استخدمها لما المستخدم يقول 'caption' أو 'بوست'.",
  parameters: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "موضوع/منتج الـ caption",
      },
      platform: {
        type: "string",
        description: "المنصة: instagram, twitter, facebook, linkedin",
        enum: ["instagram", "twitter", "facebook", "linkedin"],
        default: "instagram",
      },
      tone: {
        type: "string",
        description: "النبرة: casual, professional, funny, inspirational",
        default: "casual",
      },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const platform = String(params.platform || "instagram");
    const tone = String(params.tone || "casual");
    if (!topic) return { success: false, error: "topic مطلوب" };

    try {
      const platformInfo: Record<string, { maxLen: number; style: string }> = {
        instagram: { maxLen: 2200, style: "emoji + hashtags + engaging question" },
        twitter: { maxLen: 280, style: "short + punchy + 2 hashtags max" },
        facebook: { maxLen: 5000, style: "storytelling + CTA" },
        linkedin: { maxLen: 3000, style: "professional + insightful + question" },
      };
      const info = platformInfo[platform] || platformInfo.instagram;

      const result = await callGLMForJSON({
        systemPrompt: `اكتب caption لـ ${platform} عن: ${topic}

النبرة: ${tone}
الأسلوب: ${info.style}
الحد الأقصى: ${info.maxLen} حرف

اكتب 3 نسخ مختلفة. رجّع JSON:
{"captions": ["caption 1", "caption 2", "caption 3"], "hashtags": ["#tag1", "#tag2"]}

بالعربي.`,
        userMessage: topic,
        maxTokens: 2000,
        temperature: 0.8,
      });

      if (result.success) {
        return { success: true, data: { platform, topic, ...result.data } };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
