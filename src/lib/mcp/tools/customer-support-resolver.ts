/**
 * MCP Tool: Customer Support Resolver
 * سيناريو: صنف مشكلة → اقترح حل → ولّد رد
 * n8n template: "Automate Customer Support Issue Resolution using AI Text Classifier"
 * 
 * الخطوات:
 * 1. صنّف المشكلة (technical, billing, general, urgent)
 * 2. ابحث عن حلول مقترحة
 * 3. ولّد رد للعميل
 * 4. حدد الأولوية
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const customerSupportTool: MCPTool = {
  name: "customer_support_resolver",
  description: "حل مشاكل العملاء تلقائياً — تصنيف + حل + رد (سيناريو متكامل). استخدمها لما المستخدم يقول 'حل مشكلة عميل' أو 'customer support'.",
  parameters: {
    type: "object",
    properties: {
      issue: { type: "string", description: "نص شكوى/مشكلة العميل" },
      customerName: { type: "string", description: "اسم العميل (اختياري)", default: "" },
      product: { type: "string", description: "المنتج/الخدمة (اختياري)", default: "" },
    },
    required: ["issue"],
  },
  async execute(params) {
    const issue = String(params.issue || "").trim();
    const customerName = String(params.customerName || "").trim();
    const product = String(params.product || "").trim();
    if (!issue) return { success: false, error: "issue مطلوبة" };

    try {
      // ═══ 1) صنّف + حلل + ولّد رد ═══
      const analysis = await callGLMForJSON({
        systemPrompt: `أنت مسؤول دعم عملاء محترف. حلل المشكلة دي:

المشكلة: "${issue}"
${customerName ? `العميل: ${customerName}` : ""}
${product ? `المنتج: ${product}` : ""}

1. صنّف المشكلة: technical, billing, shipping, account, general, urgent
2. حدد الأولوية: low, medium, high, critical
3. شعر بالعميل (sentiment)
4. اقترح خطوات حل
5. ولّد رد احترافي للعميل

رجّع JSON:
{
  "classification": "technical|billing|shipping|account|general",
  "priority": "low|medium|high|critical",
  "sentiment": "positive|neutral|frustrated|angry",
  "root_cause": "السبب المحتمل",
  "solution_steps": ["خطوة 1", "خطوة 2", "خطوة 3"],
  "customer_reply": "الرد الجاهز للعميل",
  "escalation_needed": true|false,
  "estimated_resolution_time": "الوقت المتوقع"
}`,
        userMessage: issue,
        maxTokens: 1000,
        temperature: 0.4,
      });

      const result = analysis.data || {};

      return {
        success: true,
        data: {
          scenario: "customer_support_resolver",
          issue: issue.slice(0, 200),
          customer: customerName || null,
          product: product || null,
          steps: {
            classify: !!result.classification,
            analyze: !!result.root_cause,
            resolve: !!result.customer_reply,
          },
          classification: result.classification || "general",
          priority: result.priority || "medium",
          sentiment: result.sentiment || "neutral",
          root_cause: result.root_cause || "",
          solution_steps: result.solution_steps || [],
          customer_reply: result.customer_reply || "",
          escalation_needed: result.escalation_needed || false,
          estimated_resolution_time: result.estimated_resolution_time || "غير محدد",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
