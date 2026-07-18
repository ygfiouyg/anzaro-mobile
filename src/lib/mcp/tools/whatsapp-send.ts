/**
 * MCP Tool — WhatsApp Cloud API Send
 * ==================================
 * إرسال رسالة واتساب (نص / قالب) عبر WhatsApp Cloud API.
 * بيحتاج WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID env vars.
 */
import type { MCPTool } from "../types";

interface WhatsAppSendResult {
  messageId: string;
  recipient: string;
  status: string;
  sentAt: string;
}

export const whatsappSendTool: MCPTool = {
  name: "whatsapp_send",
  description:
    "Send a WhatsApp message via the WhatsApp Cloud API. Supports text and template messages. Requires WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars. The recipient phone number must be in international format without + (e.g. '201234567890').",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Recipient phone number in international format (e.g. '201234567890' for Egypt).",
      },
      text: {
        type: "string",
        description: "The text message body. Required for type='text'.",
      },
      type: {
        type: "string",
        description: "Message type.",
        enum: ["text", "template"],
        default: "text",
      },
      templateName: {
        type: "string",
        description: "Template name (only for type='template'). Must be a pre-approved template.",
      },
      templateLanguage: {
        type: "string",
        description: "Template language code. Default 'en_US'.",
        default: "en_US",
      },
      templateComponents: {
        type: "string",
        description:
          "Optional: JSON-encoded components array for template parameters (e.g. '[{\"type\":\"body\",\"parameters\":[{\"type\":\"text\",\"text\":\"Ahmed\"}]}]').",
      },
    },
    required: ["to"],
  },
  async execute(params) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return {
        success: false,
        error:
          "WHATSAPP_TOKEN و WHATSAPP_PHONE_NUMBER_ID env vars لازم يكونوا مضبوطين.",
      };
    }

    const to = String(params.to || "").replace(/[^\d]/g, "");
    if (!to) {
      return { success: false, error: "to مطلوبة (رقم هاتف دولي)" };
    }
    if (to.length < 8 || to.length > 15) {
      return { success: false, error: `رقم الهاتف غير صالح: ${to}` };
    }

    const type = (String(params.type || "text").toLowerCase().trim()) as "text" | "template";

    let body: Record<string, unknown>;
    if (type === "template") {
      const templateName = String(params.templateName || "").trim();
      if (!templateName) {
        return { success: false, error: "templateName مطلوبة لما type='template'" };
      }
      const templateLanguage = String(params.templateLanguage || "en_US");
      let components: unknown[] | undefined;
      if (params.templateComponents) {
        try {
          const parsed = JSON.parse(String(params.templateComponents));
          if (Array.isArray(parsed)) components = parsed;
        } catch {
          return { success: false, error: "templateComponents لازم يكون JSON array صالح" };
        }
      }
      body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          ...(components ? { components } : {}),
        },
      };
    } else {
      const text = String(params.text || "").trim();
      if (!text) {
        return { success: false, error: "text مطلوبة لما type='text'" };
      }
      body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text, preview_url: true },
      };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        },
      );

      const data = await res.json();
      if (!res.ok || data.error) {
        const errMsg = data.error?.message || data.error?.error_data?.details || `HTTP ${res.status}`;
        return {
          success: false,
          error: `WhatsApp API error: ${errMsg}`,
        };
      }

      const result: WhatsAppSendResult = {
        messageId: data.messages?.[0]?.id || "",
        recipient: to,
        status: "sent",
        sentAt: new Date().toISOString(),
      };

      return {
        success: true,
        data: {
          ...result,
          type,
          delivered: true,
        },
      };
    } catch (e: any) {
      return { success: false, error: `WhatsApp send error: ${e.message}` };
    }
  },
};
