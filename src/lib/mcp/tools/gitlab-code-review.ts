/**
 * MCP Tool: GitLab MR Code Review
 * القسم 4 #4: "ChatGPT Automatic Code Review in Gitlab MR"
 * الخطوات: اقبل كود → حلل → رجّع review مع تعليقات على الأسطر
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const gitlabCodeReviewTool: MCPTool = {
  name: "gitlab_code_review",
  description: "مراجعة كود تلقائية — تحليل + تعليقات + توصيات (سيناريو متكامل). استخدمها لما المستخدم يقول 'code review' أو 'راجع MR' أو 'gitlab'.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "الكود المراد مراجعته" },
      language: { type: "string", description: "لغة البرمجة (اختياري)" },
      context: { type: "string", description: "سياق إضافي (اختياري)" },
    },
    required: ["code"],
  },
  async execute(params) {
    const code = String(params.code || "").trim();
    const language = String(params.language || "").trim();
    const context = String(params.context || "").trim();
    if (!code) return { success: false, error: "code مطلوب" };
    try {
      const result = await callGLMForJSON({
        systemPrompt: `أنت مراجع كود محترف. راجع الكود ده${language ? ` (${language})` : ""}.
${context ? `سياق: ${context.slice(0, 300)}` : ""}
رجّع JSON:
{
  "overall_score": 0-10,
  "issues": [{"line":0,"severity":"critical|warning|info","message":"","suggestion":""}],
  "strengths": ["نقطة قوة"],
  "improvements": ["تحسين مقترح"],
  "security_concerns": ["مشكلة أمنية"],
  "performance_notes": ["ملاحظة أداء"],
  "summary": "ملخص"
}`,
        userMessage: code.slice(0, 3000),
        maxTokens: 500,
        temperature: 0.2,
      });
      const r = result.data || {};
      return { success: true, data: { scenario: "gitlab_code_review", language, code_length: code.length, steps: { analyze: true, review: !!r.summary }, ...r } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
