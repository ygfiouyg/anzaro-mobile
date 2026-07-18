/**
 * MCP Tool: Private AI Assistant
 * n8n: "Private & Local Ollama Self-Hosted AI Assistant"
 * 
 * إصلاح: استخدم in-memory store + قلل GLM prompt + fallback لموديل احتياطي
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";
import { getAllItems, setItem } from "../memory-store";

/** استدعاء GLM مع retry + fallback لموديل احتياطي. */
async function callGLMWithFallback(
  sysPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number,
): Promise<{ content: string; modelUsed: string; retries: number }> {
  const models = ["glm-5.2", "glm-4.6-air"];
  let lastErr = "";
  let retries = 0;

  for (let m = 0; m < models.length; m++) {
    const currentModel = models[m];
    const attempts = m === 0 ? 3 : 2; // 3 محاولات للأساسي، 2 للاحتياطي
    for (let a = 0; a < attempts; a++) {
      try {
        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model: currentModel,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature,
        });
        const content = completion?.choices?.[0]?.message?.content || "";
        if (content && content.trim().length >= 5) {
          return { content, modelUsed: currentModel, retries };
        }
        lastErr = `GLM (${currentModel}) رجّع response فاضي`;
        if (a < attempts - 1) {
          retries++;
          await new Promise((r) => setTimeout(r, 1500 * Math.pow(1.5, a)));
        }
      } catch (e: any) {
        lastErr = e?.message || "GLM call failed";
        if (/429|rate.?limit|too many/i.test(lastErr) && a < attempts - 1) {
          retries++;
          await new Promise((r) => setTimeout(r, 1500 * (a + 2)));
        } else if (a < attempts - 1) {
          retries++;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
  }
  return { content: "", modelUsed: "", retries };
}

export const privateAssistantTool: MCPTool = {
  name: "private_assistant",
  description: "مساعد شخصي ذكي — يسترجع ذاكرة + يولّد رد شخصي + يحفظ (سيناريو متكامل). استخدمها لما المستخدم يقول 'مساعد شخصي' أو 'private assistant'.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "رسالة المستخدم" },
      userId: { type: "string", description: "ID المستخدم (اختياري)", default: "default" },
      conversationContext: { type: "string", description: "سياق المحادثة السابقة (اختياري)" },
    },
    required: ["message"],
  },
  async execute(params) {
    const message = String(params.message || "").trim();
    const userId = String(params.userId || "default");
    const context = String(params.conversationContext || "").trim();
    if (!message) return { success: false, error: "message مطلوب" };

    try {
      // 1) استرجع ذاكرة من in-memory store
      const namespace = `assistant_${userId}`;
      const memories = getAllItems(namespace);
      const memoryContext = memories.length > 0
        ? memories.slice(-5).map((m) => `${m.key}: ${String(m.value).slice(0, 100)}`).join("\n")
        : "";

      // 2) ولّد رد شخصي — prompt قصير + retry + fallback
      const sysPrompt = `أنت مساعد شخصي ذكي.${memoryContext ? `\nمعلومات عن المستخدم:\n${memoryContext.slice(0, 300)}` : ""}${context ? `\nسياق: ${context.slice(0, 200)}` : ""}\nجاوب بشكل شخصي ومفيد بالعربية.`;

      const { content: response, modelUsed } = await callGLMWithFallback(
        sysPrompt,
        message,
        300,
        0.7,
      );

      const finalResponse = response || "عذراً، لم أتمكن من الرد. حاول مرة تانية.";

      // 3) احفظ الرسالة في الذاكرة
      setItem(namespace, `msg_${Date.now()}`, { type: "user", text: message.slice(0, 200) });
      setItem(namespace, `reply_${Date.now()}`, { type: "assistant", text: finalResponse.slice(0, 200) });

      // 4) استخرج معلومات للحفظ (prompt قصير جداً)
      let suggestedMemory: any = null;
      if (message.length > 10 && finalResponse !== "عذراً، لم أتمكن من الرد. حاول مرة تانية.") {
        try {
          const zai = await getZAIClient();
          let extText = "";
          // جرّب موديلين للاستخراج
          for (const mdl of ["glm-5.2", "glm-4.6-air"]) {
            try {
              const ext = await zai.chat.completions.create({
                model: mdl,
                messages: [{ role: "user", content: `من: "${message.slice(0, 100)}". استخرج معلومة شخصية. JSON: {"key":"","value":""} أو {"key":"none"}` }],
                max_tokens: 80,
                temperature: 0.1,
              });
              extText = ext?.choices?.[0]?.message?.content || "";
              if (extText && extText.trim().length >= 5) break;
            } catch {
              // continue to next model
            }
          }
          const match = extText.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              if (parsed.key && parsed.key !== "none") {
                setItem(namespace, parsed.key, parsed.value);
                suggestedMemory = parsed;
              }
            } catch {}
          }
        } catch {}
      }

      return {
        success: true,
        data: {
          scenario: "private_assistant",
          message: message.slice(0, 200),
          steps: {
            retrieve_memory: memories.length > 0,
            generate_response: !!response,
            extract_new_info: !!suggestedMemory,
          },
          memory_used: memories.length,
          model_used: modelUsed,
          response: finalResponse,
          suggested_memory: suggestedMemory,
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
