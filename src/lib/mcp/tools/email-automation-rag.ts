/**
 * MCP Tool: Email Automation RAG
 * القسم 4 #3: "AI-Powered Email Automation for Business: Summarize & Respond with RAG"
 * الخطوات: اقرأ إيميل → لخّص → صنّف → ولّد رد مع RAG
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const emailAutomationRagTool: MCPTool = {
  name: "email_automation_rag",
  description: "أتمتة إيميلات — لخّص + صنّف + ولّد رد مع RAG (سيناريو متكامل). استخدمها لما المستخدم يقول 'أتمتة إيميل' أو 'email RAG'.",
  parameters: {
    type: "object",
    properties: {
      email: { type: "string", description: "نص الإيميل" },
      knowledgeBase: { type: "string", description: "قاعدة معرفة (نص مرجعي للردود)" },
    },
    required: ["email"],
  },
  async execute(params) {
    const email = String(params.email || "").trim();
    const kb = String(params.knowledgeBase || "").trim();
    if (!email) return { success: false, error: "email مطلوب" };
    try {
      const result = await callGLMForJSON({
        systemPrompt: `حلل الإيميل ده وأنت مساعد أعمال.
${kb ? `قاعدة المعرفة: ${kb.slice(0, 1000)}` : ""}
رجّع JSON:
{
  "summary": "ملخص 2 أسطر",
  "category": "inquiry|complaint|support|billing|spam|other",
  "priority": "low|medium|high|urgent",
  "sentiment": "positive|neutral|negative",
  "draft_reply": "الرد المقترح",
  "action_items": ["مهمة 1"],
  "escalation": true|false
}`,
        userMessage: email.slice(0, 1500),
        maxTokens: 500,
        temperature: 0.3,
      });
      const r = result.data || {};
      return { success: true, data: { scenario: "email_automation_rag", steps: { summarize: !!r.summary, classify: !!r.category, generate_reply: !!r.draft_reply }, ...r } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
