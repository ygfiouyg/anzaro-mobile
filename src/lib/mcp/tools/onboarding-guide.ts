/**
 * MCP Tool: Onboarding Guide Generator
 * فكرة من: "ClientFlow Lite - Client Onboarding Automation"
 * بيعمل دليل onboarding لمستخدم/موظف/عميل جديد.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const onboardingGuideTool: MCPTool = {
  name: "onboarding_guide",
  description: "اعمل دليل onboarding لمستخدم/موظف جديد. استخدمها لما المستخدم يقول 'onboarding' أو 'ترحيب' أو 'دليل بدء'.",
  parameters: {
    type: "object",
    properties: {
      role: { type: "string", description: "الدور/المسمى (مثلاً: مطور جديد، عميل SaaS)" },
      product: { type: "string", description: "المنتج/الشركة (اختياري)" },
      duration: { type: "string", description: "مدة الـ onboarding: day, week, month", default: "week" },
    },
    required: ["role"],
  },
  async execute(params) {
    const role = String(params.role || "");
    const product = String(params.product || "");
    const duration = String(params.duration || "week");
    if (!role) return { success: false, error: "role مطلوب" };
    try {
      const systemMsg = `أنت مختص HR و onboarding محترف. اعمل دليل onboarding لـ: "${role}"
${product ? `المنتج/الشركة: ${product}` : ""}
مدة الـ onboarding: ${duration}.

الدليل لازم يحتوي على:
- رسالة ترحيب
- أهداف الأسبوع/الشهر الأول
- المهام اليومية/الأسبوعية
- الموارد المطلوبة (أدوات، وثائق، تدريب)
- الأشخاص اللي لازم يتعرف عليهم
- معالم النجاح (milestones)
- تقييم التقدم

رجّع JSON فقط:
{"welcome_message":"","objectives":[],"schedule":[{"period":"","tasks":[],"resources":[]}],"key_people":[{"name_role":"","purpose":""}],"milestones":[{"milestone":"","target":""}],"success_metrics":[],"tools_needed":[]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: role,
        maxTokens: 3000,
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
