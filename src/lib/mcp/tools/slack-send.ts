/**
 * MCP Tool: Slack Send Message
 * تكامل حقيقي مع Slack Incoming Webhooks — إرسال رسالة لقناة.
 * محتاج SLACK_WEBHOOK_URL env var.
 */
import type { MCPTool } from "../types";

export const slackSendTool: MCPTool = {
  name: "slack_send",
  description: "ابعت رسالة لقناة Slack (API حقيقي). استخدمها لما المستخدم يقول 'slack' أو 'ابعت لـ slack'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "نص الرسالة" },
      channel: { type: "string", description: "اسم القناة (اختياري — لو الـ webhook مخصص لقناة)" },
      emoji: { type: "string", description: "emoji للأيقونة (اختياري، مثلاً: 🚀)" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    const channel = String(params.channel || "").trim();
    const emoji = String(params.emoji || "").trim();

    if (!text) return { success: false, error: "text مطلوب" };

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return {
        success: false,
        error: "SLACK_WEBHOOK_URL env var مش متاح. أنشئ webhook من Slack Admin وضيفه.",
      };
    }

    try {
      const payload: any = {
        text,
        ...(channel ? { channel } : {}),
        ...(emoji ? { icon_emoji: emoji } : {}),
      };

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `Slack API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const responseText = await res.text();

      return {
        success: true,
        data: {
          sent: true,
          text: text.slice(0, 100),
          channel: channel || "(default webhook channel)",
          response: responseText,
          sentAt: new Date().toISOString(),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
