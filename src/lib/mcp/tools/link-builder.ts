/**
 * MCP Tool: UTM Link Builder + QR Code
 * فكرة من: "UTM Link Creator & QR Code Generator with Scheduled Google Analytics Reports"
 * بيولّد UTM link + QR code لأي URL.
 */
import type { MCPTool } from "../types";

export const linkBuilderTool: MCPTool = {
  name: "link_builder",
  description: "ولّد UTM link + QR code لأي URL. استخدمها لما المستخدم يقول 'UTM' أو 'QR' أو 'link tracking' أو 'رابط متتبع'.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "الرابط الأصلي" },
      source: { type: "string", description: "utm_source (مثلاً: newsletter, facebook)" },
      medium: { type: "string", description: "utm_medium (مثلاً: email, cpc)" },
      campaign: { type: "string", description: "utm_campaign (مثلاً: summer_sale)" },
      term: { type: "string", description: "utm_term (اختياري)" },
      content: { type: "string", description: "utm_content (اختياري)" },
    },
    required: ["url", "source", "medium", "campaign"],
  },
  async execute(params) {
    const url = String(params.url || "").trim();
    const source = String(params.source || "").trim();
    const medium = String(params.medium || "").trim();
    const campaign = String(params.campaign || "").trim();
    const term = String(params.term || "").trim();
    const content = String(params.content || "").trim();

    if (!url) return { success: false, error: "url مطلوب" };
    if (!source || !medium || !campaign) {
      return { success: false, error: "source و medium و campaign مطلوبين" };
    }

    try {
      // بناء UTM link
      const utmParams = new URLSearchParams();
      utmParams.set("utm_source", source);
      utmParams.set("utm_medium", medium);
      utmParams.set("utm_campaign", campaign);
      if (term) utmParams.set("utm_term", term);
      if (content) utmParams.set("utm_content", content);

      const separator = url.includes("?") ? "&" : "?";
      const utmLink = `${url}${separator}${utmParams.toString()}`;

      // بناء QR code URL (خدمة QRServer.com مجانية)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(utmLink)}`;

      // تحليل الـ UTM
      const breakdown = {
        source,
        medium,
        campaign,
        ...(term ? { term } : {}),
        ...(content ? { content } : {}),
      };

      return {
        success: true,
        data: {
          original_url: url,
          utm_link: utmLink,
          qr_code_url: qrUrl,
          utm_breakdown: breakdown,
          note: "الـ UTM link جاهز للتتبع في Google Analytics. امسح الـ QR code للموبايل.",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
