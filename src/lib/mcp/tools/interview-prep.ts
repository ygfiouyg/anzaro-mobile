/**
 * MCP Tool: Interview Prep Generator
 * فكرة من: "Conversational Interviews with AI Agents and n8n Forms"
 * بيعمل تحضير لمقابلة شغل — أسئلة محتملة + نصائح.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const interviewPrepTool: MCPTool = {
  name: "interview_prep",
  description: "حضّر لمقابلة شغل — أسئلة محتملة + إجابات نموذجية + نصائح. استخدمها لما المستخدم يقول 'مقابلة' أو 'interview' أو 'تحضير مقابلة'.",
  parameters: {
    type: "object",
    properties: {
      jobTitle: { type: "string", description: "المسمى الوظيفي" },
      type: { type: "string", description: "نوع المقابلة: technical, behavioral, mixed", default: "mixed" },
      company: { type: "string", description: "الشركة (اختياري)" },
    },
    required: ["jobTitle"],
  },
  async execute(params) {
    const jobTitle = String(params.jobTitle || "");
    const type = String(params.type || "mixed");
    const company = String(params.company || "");
    if (!jobTitle) return { success: false, error: "jobTitle مطلوب" };
    try {
      const systemMsg = `أنت خبير HR متخصص في تحضير المرشحين للمقابلات.
حضّر مرشح لمقابلة: "${jobTitle}"
النوع: ${type}. ${company ? `الشركة: ${company}` : ""}

رجّع:
- 10 أسئلة محتملة (3 سلوكية + 4 تقنية + 3 situational لو mixed)
- لكل سؤال: إجابة نموذجية (STAR method للسلوكية)
- 5 نصائح عامة
- أسئلة يفضل المرشح يسألها
- red flags يتجنبها

رجّع JSON فقط:
{"questions":[{"question":"","type":"","model_answer":"","tips":""}],"general_tips":[],"questions_to_ask":[],"red_flags":[]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: jobTitle,
        maxTokens: 3000,
        temperature: 0.6,
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
