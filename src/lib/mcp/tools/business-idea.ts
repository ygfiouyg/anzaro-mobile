/**
 * MCP Tool: Business Idea Evaluator
 * فكرة من: startup/market templates
 * بيقيّم فكرة عمل ويعطي تحليل SWOT + توصيات.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const businessIdeaTool: MCPTool = {
  name: "business_idea",
  description: "قيّم فكرة عمل + تحليل SWOT + توصيات. استخدمها لما المستخدم يقول 'فكرة عمل' أو 'business plan' أو 'مشروع'.",
  parameters: {
    type: "object",
    properties: {
      idea: { type: "string", description: "وصف الفكرة" },
      market: { type: "string", description: "السوق المستهدف (اختياري)" },
      budget: { type: "string", description: "الميزانية التقريبية (اختياري)" },
    },
    required: ["idea"],
  },
  async execute(params) {
    const idea = String(params.idea || "");
    const market = String(params.market || "");
    const budget = String(params.budget || "");
    if (!idea) return { success: false, error: "idea مطلوبة" };
    try {
      const systemMsg = `أنت مستشار أعمال محترف. قيّم فكرة العمل دي:
"${idea}"
${market ? `السوق: ${market}` : ""}
${budget ? `الميزانية: ${budget}` : ""}

اعمل:
1. تحليل SWOT (Strengths, Weaknesses, Opportunities, Threats) — 3-4 نقاط لكل واحد
2. تقييم الجدوى (feasibility score 0-100)
3. تحليل المنافسين (3 منافسين محتملين)
4. نموذج الإيرادات المقترح
5. المخاطر الرئيسية + طرق التخفيف
6. التوصية النهائية: go, pivot, أو no-go

رجّع JSON فقط:
{"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"feasibility_score":0,"competitors":[{"name":"","advantage":"","weakness":""}],"revenue_model":"","risks":[{"risk":"","mitigation":""}],"recommendation":"","reason":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: idea,
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
