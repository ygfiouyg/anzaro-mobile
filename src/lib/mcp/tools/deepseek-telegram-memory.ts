/**
 * MCP Tool: DeepSeek Telegram Memory
 * القسم 4 #2: "DeepSeek AI Agent + Telegram + LONG TERM Memory"
 * نفس telegram_ai_bot بس مع ذاكرة طويلة المدى محسّنة
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";
import { getAllItems, setItem } from "../memory-store";

export const deepseekTelegramTool: MCPTool = {
  name: "deepseek_telegram_memory",
  description: "وكيل تليجرام بذاكرة طويلة المدى — reasoning + memory + reply (سيناريو متكامل). استخدمها لما المستخدم يقول 'deepseek telegram' أو 'وكيل تليجرام ذكي'.",
  parameters: {
    type: "object",
    properties: {
      chatId: { type: "string", description: "chat_id" },
      message: { type: "string", description: "رسالة المستخدم" },
    },
    required: ["chatId", "message"],
  },
  async execute(params) {
    const chatId = String(params.chatId || "").trim();
    const message = String(params.message || "").trim();
    if (!chatId || !message) return { success: false, error: "chatId و message مطلوبين" };
    try {
      // 1) ذاكرة طويلة المدى — استرجع كل المحادثة
      const ns = `tg_longterm_${chatId}`;
      const allHistory = getAllItems(ns);
      const facts = getAllItems(`tg_facts_${chatId}`); // حقائق محفوظة عن المستخدم

      const context = allHistory.slice(-10).map((h) => {
        const v = typeof h.value === "object" ? h.value : { text: String(h.value) };
        return `${v.role}: ${v.text || ""}`;
      }).join("\n");

      const factsText = facts.map((f) => f.value).join(", ");

      // 2) reasoning + reply
      const zai = await getZAIClient();
      const completion = await zai.chat.completions.create({
        model: "glm-5.2",
        messages: [
          { role: "system", content: `أنت وكيل ذكي بذاكرة طويلة المدى.${factsText ? `\nحقائق عن المستخدم: ${factsText.slice(0, 200)}` : ""}${context ? `\nآخر المحادثات:\n${context.slice(0, 500)}` : ""}\nجاوب بالعربية.` },
          { role: "user", content: message },
        ],
        max_tokens: 300,
        temperature: 0.6,
      });
      const response = completion?.choices?.[0]?.message?.content || "عذراً";

      // 3) احفظ
      setItem(ns, `u_${Date.now()}`, { role: "user", text: message.slice(0, 200) });
      setItem(ns, `a_${Date.now()}`, { role: "assistant", text: response.slice(0, 200) });

      // 4) استخرج حقائق جديدة
      try {
        const ext = await zai.chat.completions.create({
          model: "glm-5.2",
          messages: [{ role: "user", content: `من: "${message.slice(0, 100)}". استخرج معلومة شخصية. JSON: {"fact":""} أو {"fact":"none"}` }],
          max_tokens: 60,
          temperature: 0.1,
        });
        const extText = ext?.choices?.[0]?.message?.content || "";
        const m = extText.match(/\{[\s\S]*\}/);
        if (m) {
          const p = JSON.parse(m[0]);
          if (p.fact && p.fact !== "none") setItem(`tg_facts_${chatId}`, `fact_${Date.now()}`, p.fact);
        }
      } catch {}

      // 5) ابعت
      let sent = false;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        try {
          const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: response.slice(0, 4000) }),
            signal: AbortSignal.timeout(10000),
          });
          sent = r.ok;
        } catch {}
      }

      return {
        success: true,
        data: {
          scenario: "deepseek_telegram_memory",
          chat_id: chatId,
          steps: { retrieve_memory: allHistory.length > 0, retrieve_facts: facts.length > 0, generate: true, extract_facts: true, send: sent },
          response,
          memory_size: allHistory.length + 2,
          facts_count: facts.length,
          sent,
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
