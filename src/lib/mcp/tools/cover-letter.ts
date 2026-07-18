/**
 * MCP Tool: Cover Letter Writer
 * فكرة من: resume/interview/CV templates
 * بيكتب cover letter احترافي لوظيفة معينة.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const coverLetterTool: MCPTool = {
  name: "cover_letter",
  description: "اكتب cover letter احترافي لوظيفة. استخدمها لما المستخدم يقول 'cover letter' أو 'خطاب تعريف' أو 'رسالة تقديم'.",
  parameters: {
    type: "object",
    properties: {
      jobTitle: { type: "string", description: "المسمى الوظيفي" },
      company: { type: "string", description: "اسم الشركة (اختياري)" },
      skills: { type: "string", description: "مهاراتك/خبراتك (مفصولة بفواصل)" },
      tone: { type: "string", description: "النبرة: formal, friendly, confident", default: "formal" },
    },
    required: ["jobTitle"],
  },
  async execute(params) {
    const jobTitle = String(params.jobTitle || "");
    const company = String(params.company || "");
    const skills = String(params.skills || "");
    const tone = String(params.tone || "formal");
    if (!jobTitle) return { success: false, error: "jobTitle مطلوب" };
    try {
      const systemMsg = `أنت خبير في كتابة cover letters احترافية.
اكتب cover letter لوظيفة: "${jobTitle}"
${company ? `الشركة: ${company}` : ""}
${skills ? `مهاراتي: ${skills}` : ""}
النبرة: ${tone}.

البنية المطلوبة:
1. التحية (Dear Hiring Manager / السيد/ة الموقر)
2. الفقرة الأولى: اهتمامك بالوظيفة + الشركة
3. الفقرة الثانية: خبراتك/mهاراتك المتعلقة
4. الفقرة الثالثة: قيمة هتضيفها للشركة
5. الخاتمة: call-to-action + شكر

رجّع JSON فقط:
{"greeting":"","body":{"intro":"","experience":"","value":""},"closing":"","signature":"","full_text":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: `${jobTitle}\n${company}\n${skills}`,
        maxTokens: 2000,
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
