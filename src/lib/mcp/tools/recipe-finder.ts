/**
 * MCP Tool: Recipe Finder
 * فكرة من: AI recipe / meal planner templates
 * بيقترح وصفات بناءً على المكونات المتاحة.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const recipeFinderTool: MCPTool = {
  name: "recipe_finder",
  description: "اقترح وصفات من المكونات المتاحة. استخدمها لما المستخدم يقول 'وصفة' أو 'أكل' أو 'مكونات'.",
  parameters: {
    type: "object",
    properties: {
      ingredients: { type: "string", description: "المكونات المتاحة (مفصولة بفواصل)" },
      diet: { type: "string", description: "نظام غذائي: any, vegetarian, vegan, keto, halal", default: "any" },
      count: { type: "number", description: "عدد الوصفات (افتراضي: 3)", default: 3 },
    },
    required: ["ingredients"],
  },
  async execute(params) {
    const ingredients = String(params.ingredients || "");
    const diet = String(params.diet || "any");
    const count = Number(params.count) || 3;
    if (!ingredients) return { success: false, error: "ingredients مطلوبة" };
    try {
      const systemMsg = `أنت شيف محترف. اقترح ${count} وصفات باستخدام المكونات دي: "${ingredients}".
النظام الغذائي: ${diet}.

لكل وصفة:
- اسم الوصفة
- وقت التحضير
- المكونات الإضافية (لو محتاج)
- خطوات التحضير مرتبة
- عدد الأشخاص

رجّع JSON فقط:
{"recipes":[{"name":"","prep_time":"","servings":0,"ingredients":[],"steps":[],"difficulty":""}]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: ingredients,
        maxTokens: 3000,
        temperature: 0.7,
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
