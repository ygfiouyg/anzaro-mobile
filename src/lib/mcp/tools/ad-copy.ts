/**
 * MCP Tool: Ad Copy Generator
 * فكرة من: marketing/ad templates
 * بيكتب إعلانات احترافية لمنصات مختلفة.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const adCopyTool: MCPTool = {
  name: "ad_copy",
  description: "اكتب إعلانات احترافية لمنصات مختلفة. استخدمها لما المستخدم يقول 'إعلان' أو 'ad' أو 'slogan' أو 'دعاية'.",
  parameters: {
    type: "object",
    properties: {
      product: { type: "string", description: "المنتج/الخدمة" },
      platform: { type: "string", description: "المنصة: facebook, instagram, google, tiktok, linkedin", default: "facebook" },
      audience: { type: "string", description: "الجمهور المستهدف (اختياري)" },
      offer: { type: "string", description: "العرض/الميزة الرئيسية (اختياري)" },
    },
    required: ["product"],
  },
  async execute(params) {
    const product = String(params.product || "");
    const platform = String(params.platform || "facebook");
    const audience = String(params.audience || "");
    const offer = String(params.offer || "");
    if (!product) return { success: false, error: "product مطلوب" };
    try {
      const platformLimits: Record<string, { headline: number; body: number }> = {
        facebook: { headline: 40, body: 125 },
        instagram: { headline: 30, body: 2200 },
        google: { headline: 30, body: 90 },
        tiktok: { headline: 25, body: 100 },
        linkedin: { headline: 70, body: 150 },
      };
      const limits = platformLimits[platform] || platformLimits.facebook;
      const systemMsg = `أنت copywriter محترف في الإعلانات. اكتب إعلان لـ: "${product}"
المنصة: ${platform} (حدود: headline ${limits.headline} حرف، body ${limits.body} حرف)
${audience ? `الجمهور: ${audience}` : ""}
${offer ? `العرض: ${offer}` : ""}

اعمل 3 نسخ مختلفة (A/B/C):
- A: عاطفي (emotional appeal)
- B: منطقي (rational/benefit-driven)
- C: urgency (ندرة/وقت محدود)

لكل نسخة:
- Headline جذاب
- Body text واضح ومقنع
- Call-to-action قوي
- Hashtags (لو Instagram/TikTok)

رجّع JSON فقط:
{"platform":"","product":"","variants":[{"variant":"","angle":"","headline":"","body":"","cta":"","hashtags":[]}],"best_practices":[]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: product,
        maxTokens: 3000,
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
