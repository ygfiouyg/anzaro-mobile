/**
 * MCP Tool: Telegram AI Bot
 * القسم 4 #1: "Telegram Bot with Supabase memory and OpenAI assistant integration"
 * الخطوات: اقبل رسالة → استرجع ذاكرة → ولّد رد → ابعت → احفظ
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";
import { getAllItems, setItem } from "../memory-store";

export const telegramAiBotTool: MCPTool = {
  name: "telegram_ai_bot",
  description: "بوت تليجرام ذكي — ذاكرة + رد + إرسال (سيناريو متكامل). استخدمها لما المستخدم يقول 'telegram bot' أو 'بوت تليجرام'.",
  parameters: {
    type: "object",
    properties: {
      chatId: { type: "string", description: "chat_id في تليجرام" },
      message: { type: "string", description: "رسالة المستخدم" },
      reply: { type: "boolean", description: "ابعت الرد على تليجرام؟ (افتراضي: true)", default: true },
    },
    required: ["chatId", "message"],
  },
  async execute(params) {
    const chatId = String(params.chatId || "").trim();
    const message = String(params.message || "").trim();
    const shouldReply = params.reply !== false;
    if (!chatId || !message) return { success: false, error: "chatId و message مطلوبين" };

    try {
      // 1) استرجع ذاكرة المحادثة
      const namespace = `telegram_${chatId}`;
      const history = getAllItems(namespace);
      const context = history.slice(-6).map((h) => {
        const v = typeof h.value === "object" ? h.value : { text: String(h.value) };
        return `${v.role || "user"}: ${v.text || ""}`;
      }).join("\n");

      // 2) ولّد رد
      const zai = await getZAIClient();
      const completion = await zai.chat.completions.create({
        model: "glm-5.2",
        messages: [
          { role: "system", content: `أنت بوت تليجرام ذكي. جاوب بالعربية بشكل مختصر ومفيد.${context ? `\nسياق:\n${context.slice(0, 400)}` : ""}` },
          { role: "user", content: message },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });
      const response = completion?.choices?.[0]?.message?.content || "عذراً، لم أفهم";

      // 3) احفظ في الذاكرة
      setItem(namespace, `user_${Date.now()}`, { role: "user", text: message.slice(0, 200) });
      setItem(namespace, `bot_${Date.now()}`, { role: "assistant", text: response.slice(0, 200) });

      // 4) ابعت على تليجرام
      let delivery: any = { sent: false };
      if (shouldReply) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: response.slice(0, 4000) }),
              signal: AbortSignal.timeout(10000),
            });
            delivery = { sent: res.ok, status: res.ok ? "sent" : "failed" };
          } catch (e: any) { delivery = { sent: false, error: e.message }; }
        } else {
          delivery = { sent: false, error: "TELEGRAM_BOT_TOKEN مش متاح" };
        }
      }

      return {
        success: true,
        data: {
          scenario: "telegram_ai_bot",
          chat_id: chatId,
          steps: { retrieve_memory: history.length > 0, generate: !!response, save: true, send: delivery.sent },
          response,
          delivery,
          memory_entries: history.length + 2,
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
