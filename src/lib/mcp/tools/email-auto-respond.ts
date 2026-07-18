/**
 * MCP Tool: Email Auto Respond
 * ============================
 * سيناريو متكامل: "رد على إيميلاتي"
 *
 * الخطوات:
 * 1. اقرأ آخر إيميلات (محاكاة - محتاج IMAP/Gmail API)
 * 2. صنفها: مهم / سبام / رد سريع / يحتاج تفكير
 * 3. ولّد رد مناسب لكل واحد
 * 4. اعمل draft أو ابعت
 *
 * مستوحى من n8n templates:
 * - AI-Powered Email Automation for Business: Summarize & Respond with RAG
 * - AI Email Auto-Responder with Ollama
 * - AI-powered email processing autoresponder and response approval
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const emailAutoRespondTool: MCPTool = {
  name: "email_auto_respond",
  description: "تحليل ورد تلقائي على إيميلات — يصنف، يولّد ردود، ويعمل drafts. استخدمها لما المستخدم يقول 'رد على إيميلاتي' أو 'حلل إيميلاتي'.",
  parameters: {
    type: "object",
    properties: {
      emails: { type: "string", description: "نص الإيميلات (كل إيميل مفصول بـ ---)" },
      autoSend: { type: "boolean", description: "إرسال تلقائي؟ (افتراضي: false = draft فقط)", default: false },
      tone: { type: "string", description: "نبرة الرد: formal, friendly, brief, detailed (افتراضي: professional)", default: "professional" },
      maxReplies: { type: "number", description: "أقصى عدد ردود (افتراضي: 5)", default: 5 },
    },
    required: ["emails"],
  },
  async execute(params) {
    const emailsText = String(params.emails || "").trim();
    const autoSend = Boolean(params.autoSend);
    const tone = String(params.tone || "professional");
    const maxReplies = Math.min(10, Math.max(1, Number(params.maxReplies) || 5));

    if (!emailsText) return { success: false, error: "emails مطلوبة" };

    try {
      // ═══ الخطوة 1: قسّم الإيميلات ═══
      const emails = emailsText.split(/\n---\n/).map((e) => e.trim()).filter(Boolean).slice(0, maxReplies);

      if (emails.length === 0) {
        return { success: false, error: "مفيش إيميلات صالحة" };
      }

      // ═══ الخطوة 2: صنّف + ولّد ردود ═══
      const analysis = await callGLMForJSON({
        systemPrompt: `أنت مساعد ذكي لمعالجة الإيميلات. حلل كل إيميل وولّد رد مناسب.

لكل إيميل:
1. صنّفه: important (مهم), spam (سبام), quick_reply (رد سريع), needs_thought (يحتاج تفكير), newsletter (نشرة)
2. استخرج: المرسل، الموضوع، الملخص
3. ولّد رد مناسب بنبرة ${tone}
4. حدد: هل يحتاج رد عاجل؟ (urgent)

رجّع JSON:
{
  "results": [
    {
      "sender": "اسم المرسل",
      "subject": "الموضوع",
      "summary": "ملخص الإيميل",
      "classification": "important|spam|quick_reply|needs_thought|newsletter",
      "urgent": true/false,
      "suggested_reply": "الرد المقترح",
      "reply_subject": "Re: الموضوع",
      "action": "send|draft|skip|flag"
    }
  ],
  "summary": {
    "total": عدد,
    "important": عدد,
    "spam": عدد,
    "quick_replies": عدد,
    "needs_attention": عدد
  }
}`,
        userMessage: emails.map((e, i) => `إيميل ${i + 1}:\n${e}`).join("\n\n---\n\n"),
        maxTokens: 3000,
        temperature: 0.4,
      });

      const results = analysis.data?.results || [];
      const summary = analysis.data?.summary || {};

      // ═══ الخطوة 3: إرسال/draft ═══
      let sentCount = 0;
      let draftCount = 0;
      let skippedCount = 0;

      for (const r of results) {
        if (r.action === "skip" || r.classification === "spam" || r.classification === "newsletter") {
          skippedCount++;
          continue;
        }

        if (autoSend && r.action === "send") {
          // محاكاة إرسال (محتاج SMTP/Gmail API)
          r.delivery_status = "sent (simulated)";
          sentCount++;
        } else {
          r.delivery_status = "draft created";
          draftCount++;
        }
      }

      return {
        success: true,
        data: {
          scenario: "email_auto_respond",
          emails_processed: emails.length,
          classification: summary,
          results,
          delivery: {
            mode: autoSend ? "auto_send" : "draft_only",
            sent: sentCount,
            drafts: draftCount,
            skipped: skippedCount,
          },
          steps_completed: {
            parse_emails: true,
            classify: true,
            generate_replies: results.length > 0,
            send_or_draft: true,
          },
          note: autoSend
            ? "تم الإرسال التلقائي (محاكاة). للإرسال الفعلي، اضبط SMTP أو Gmail API."
            : "تم إنشاء drafts. راجعها قبل الإرسال.",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
