/**
 * MCP Tool: Email Reply Writer
 * فكرة من: "AI email reply" / "autoresponder" templates
 * بيكتب رد احترافي على إيميل.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const emailReplyTool: MCPTool = {
  name: "email_reply",
  description: "اكتب رد احترافي على إيميل. استخدمها لما المستخدم يقول 'رد إيميل' أو 'email reply' أو 'رد على الرسالة'.",
  parameters: {
    type: "object",
    properties: {
      originalEmail: { type: "string", description: "نص الإيميل الأصلي" },
      intent: { type: "string", description: "نية الرد: accept, decline, request_info, schedule, follow_up, apology" },
      tone: { type: "string", description: "النبرة: formal, friendly, firm, warm", default: "formal" },
      keyPoints: { type: "string", description: "نقاط رئيسية لتضمينها (اختياري)" },
    },
    required: ["originalEmail", "intent"],
  },
  async execute(params) {
    const originalEmail = String(params.originalEmail || "");
    const intent = String(params.intent || "");
    const tone = String(params.tone || "formal");
    const keyPoints = String(params.keyPoints || "");
    if (!originalEmail || !intent) return { success: false, error: "originalEmail و intent مطلوبين" };
    try {
      const intentMap: Record<string, string> = {
        accept: "قبول الطلب/الدعوة",
        decline: "رفض مهذب",
        request_info: "طلب معلومات إضافية",
        schedule: "ترتيب موعد/اجتماع",
        follow_up: "متابعة بعد فترة",
        apology: "اعتذار",
      };
      const systemMsg = `أنت كاتب إيميلات احترافي. اكتب رد على الإيميل ده:
"""
${originalEmail.slice(0, 3000)}
"""

نية الرد: ${intentMap[intent] || intent}
النبرة: ${tone}
${keyPoints ? `نقاط لتضمينها: ${keyPoints}` : ""}

الرد لازم يكون:
- مهذب ومختصر (150-250 كلمة)
- يبدأ بـ تحية مناسبة
- واضح في النية من البداية
- فيه call-to-action لو مناسب
- ينتهي بتوقيع احترافي

رجّع JSON فقط:
{"subject":"Re: ...","greeting":"","body":"","closing":"","signature":"","full_reply":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: `Intent: ${intent}\nTone: ${tone}`,
        maxTokens: 1500,
        temperature: 0.5,
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
