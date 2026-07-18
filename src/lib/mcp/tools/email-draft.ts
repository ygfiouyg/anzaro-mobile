/**
 * MCP Tool: Email Draft
 * ======================
 * فكرة من: AI-Powered Email Automation
 * يكتب إيميل احترافي
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const emailDraftTool: MCPTool = {
  name: "email_draft",
  description: "اكتب إيميل احترافي. استخدمها لما المستخدم يقول 'إيميل' أو 'email' أو 'رسالة رسمية'.",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "موضوع الإيميل" },
      purpose: { type: "string", description: "الغرض من الإيميل (شكر، اعتذار، طلب، عرض، إلخ)" },
      recipient: { type: "string", description: "المستلم (اسم أو شركة)", default: "" },
      tone: { type: "string", description: "النبرة: formal, casual, urgent", default: "formal" },
    },
    required: ["subject", "purpose"],
  },
  async execute(params) {
    const subject = String(params.subject || "");
    const purpose = String(params.purpose || "");
    const recipient = String(params.recipient || "");
    const tone = String(params.tone || "formal");
    if (!subject || !purpose) return { success: false, error: "subject و purpose مطلوبين" };
    try {
      const systemMsg = `اكتب إيميل احترافي.

البيانات:
- الموضوع: ${subject}
- الغرض: ${purpose}
- المستلم: ${recipient || "غير محدد"}
- النبرة: ${tone}

التنسيق:
Subject: [الموضوع]
Dear [المستلم],

[المحتوى]

Best regards,
[اسم المرسل]

اكتب بالعربي إذا كان الغرض عربي، أو الإنجليزية إذا كان إنجليزي.

رجّع JSON فقط:
{"email":"<نص الإيميل كامل بالتنسيق المطلوب>"}`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: purpose,
        maxTokens: 1500,
        temperature: 0.5,
      });
      if (result.success) {
        return { success: true, data: { subject, tone, ...result.data } };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
