/**
 * MCP Tool — Telegram Send Message
 * ================================
 * إرسال رسالة (نص / صورة / فيديو) لـ Telegram chat عبر Bot API.
 * بيحتاج TELEGRAM_BOT_TOKEN env var.
 */
import type { MCPTool } from "../types";

interface TelegramSendResult {
  messageId: number;
  chatId: number | string;
  sentAt: string;
}

export const telegramSendTool: MCPTool = {
  name: "telegram_send",
  description:
    "Send a message to a Telegram chat using the Bot API. Supports text, photos, and videos. Requires TELEGRAM_BOT_TOKEN env var. The chat_id can be a user id, group id, or @channelusername.",
  parameters: {
    type: "object",
    properties: {
      chatId: {
        type: "string",
        description:
          "Target Telegram chat id (e.g. '123456789') or channel username (e.g. '@mychannel').",
      },
      text: {
        type: "string",
        description: "The text message to send. Required if `parseMode` is used.",
      },
      parseMode: {
        type: "string",
        description: "Formatting mode for the text.",
        enum: ["Markdown", "MarkdownV2", "HTML"],
      },
      imageUrl: {
        type: "string",
        description: "Optional: URL of a photo to send. If set, sends a photo message.",
      },
      videoUrl: {
        type: "string",
        description: "Optional: URL of a video to send. If set, sends a video message.",
      },
      disableNotification: {
        type: "boolean",
        description: "If true, sends silently without notification sound. Default false.",
        default: false,
      },
    },
    required: ["chatId", "text"],
  },
  async execute(params) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return {
        success: false,
        error: "TELEGRAM_BOT_TOKEN env var غير مضبوط.",
      };
    }

    const chatId = String(params.chatId || "").trim();
    const text = String(params.text || "").trim();
    const parseMode = params.parseMode ? String(params.parseMode) : undefined;
    const imageUrl = params.imageUrl ? String(params.imageUrl).trim() : "";
    const videoUrl = params.videoUrl ? String(params.videoUrl).trim() : "";
    const disableNotification = Boolean(params.disableNotification);

    if (!chatId) {
      return { success: false, error: "chatId مطلوبة" };
    }
    if (!text && !imageUrl && !videoUrl) {
      return { success: false, error: "text أو imageUrl أو videoUrl مطلوبة" };
    }

    const base = `https://api.telegram.org/bot${botToken}`;

    try {
      let endpoint: string;
      const body: Record<string, unknown> = {
        chat_id: chatId,
        disable_notification: disableNotification,
      };

      if (videoUrl) {
        endpoint = "/sendVideo";
        body.video = videoUrl;
        body.caption = text;
        if (parseMode) body.parse_mode = parseMode;
      } else if (imageUrl) {
        endpoint = "/sendPhoto";
        body.photo = imageUrl;
        body.caption = text;
        if (parseMode) body.parse_mode = parseMode;
      } else {
        endpoint = "/sendMessage";
        body.text = text;
        if (parseMode) body.parse_mode = parseMode;
      }

      const res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });

      const data = await res.json();
      if (!data.ok) {
        return {
          success: false,
          error: `Telegram API error: ${data.description || data.error_code || "unknown"}`,
        };
      }

      const result: TelegramSendResult = {
        messageId: data.result.message_id,
        chatId: data.result.chat?.id ?? chatId,
        sentAt: new Date().toISOString(),
      };

      return {
        success: true,
        data: {
          ...result,
          endpoint: endpoint.slice(1),
          delivered: true,
        },
      };
    } catch (e: any) {
      return { success: false, error: `Telegram send error: ${e.message}` };
    }
  },
};
