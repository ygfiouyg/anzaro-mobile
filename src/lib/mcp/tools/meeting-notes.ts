/**
 * MCP Tool: Meeting Notes
 * فكرة من: AI Agent for realtime insights on meetings + Daily meetings summarization
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const meetingNotesTool: MCPTool = {
  name: "meeting_notes",
  description: "حوّل نص اجتماع لملاحظات منظمة + action items. استخدمها لما المستخدم يقول 'اجتماع' أو 'meeting'.",
  parameters: {
    type: "object",
    properties: {
      transcript: { type: "string", description: "نص/تفريغ الاجتماع" },
    },
    required: ["transcript"],
  },
  async execute(params) {
    const transcript = String(params.transcript || "");
    if (!transcript) return { success: false, error: "transcript مطلوب" };
    try {
      const systemMsg = `حلل نص الاجتماع واعمل:

1. 📋 ملخص الاجتماع (فقرة)
2. 🔑 النقاط الرئيسية (bullet points)
3. ✅ Action Items (مهمة + المسؤول + الموعد)
4. ❓ أسئلة معلقة
5. 💡 توصيات

رجّع JSON: {"summary":"","keyPoints":[],"actionItems":[{"task":"","assignee":"","deadline":""}],"openQuestions":[],"recommendations":[]}

بالعربي.`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: transcript.slice(0, 15000),
        maxTokens: 2000,
        temperature: 0.3,
      });
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
