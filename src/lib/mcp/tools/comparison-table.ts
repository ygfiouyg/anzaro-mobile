/**
 * MCP Tool: Comparison Table Generator
 * فكرة من: comparison/versus templates
 * بيعمل جدول مقارنة بين خيارات/منتجات.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const comparisonTableTool: MCPTool = {
  name: "comparison_table",
  description: "اعمل جدول مقارنة بين خيارات/منتجات. استخدمها لما المستخدم يقول 'قارن' أو 'مقارنة' أو 'comparison' أو 'أفضل'.",
  parameters: {
    type: "object",
    properties: {
      items: { type: "string", description: "العناصر للمقارنة (مفصولة بفواصل)" },
      criteria: { type: "string", description: "معايير المقارنة (مفصولة بفواصل، اختياري)" },
      context: { type: "string", description: "السياق/الغرض (اختياري)" },
    },
    required: ["items"],
  },
  async execute(params) {
    const items = String(params.items || "");
    const criteria = String(params.criteria || "");
    const context = String(params.context || "");
    if (!items) return { success: false, error: "items مطلوبة" };
    try {
      const itemsList = items.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
      const systemMsg = `أنت محلل محترف. اعمل جدول مقارنة شامل بين: ${itemsList.join("، ")}
${criteria ? `حسب المعايير: ${criteria}` : "حسب معايير مناسبة"}
${context ? `السياق: ${context}` : ""}

رجّع:
1. جدول مقارنة (rows = items, columns = criteria)
2. نقاط القوة لكل عنصر
3. نقاط الضعف لكل عنصر
4. التوصية النهائية (أفضل اختيار + السبب)

رجّع JSON فقط:
{"items":${JSON.stringify(itemsList)},"criteria":[],"table":[{"item":"","values":{}}],"pros_cons":[{"item":"","pros":[],"cons":[]}],"recommendation":{"winner":"","reason":"","runner_up":""}}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: items,
        maxTokens: 2500,
        temperature: 0.4,
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
