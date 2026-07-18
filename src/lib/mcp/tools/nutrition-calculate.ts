/**
 * MCP Tool: Nutrition Calculate
 * بيسجل معلومات غذائية من مكونات (محلي، تقريبي).
 */
import type { MCPTool } from "../types";

const NUTRITION_DB: Record<string, any> = {
  rice: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, unit: "per 100g cooked" },
  bread: { calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7, unit: "per 100g" },
  chicken: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, unit: "per 100g cooked" },
  egg: { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, unit: "per 100g" },
  beef: { calories: 250, protein: 26, carbs: 0, fat: 17, fiber: 0, unit: "per 100g cooked" },
  fish: { calories: 206, protein: 22, carbs: 0, fat: 12, fiber: 0, unit: "per 100g cooked" },
  milk: { calories: 42, protein: 3.4, carbs: 5, fat: 1, fiber: 0, unit: "per 100ml" },
  cheese: { calories: 402, protein: 25, carbs: 1.3, fat: 33, fiber: 0, unit: "per 100g" },
  potato: { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, unit: "per 100g" },
  tomato: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, unit: "per 100g" },
  onion: { calories: 40, protein: 1.1, carbs: 9, fat: 0.1, fiber: 1.7, unit: "per 100g" },
  banana: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, unit: "per 100g" },
  apple: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, unit: "per 100g" },
  orange: { calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, unit: "per 100g" },
  pasta: { calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, unit: "per 100g cooked" },
  lentils: { calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, unit: "per 100g cooked" },
  beans: { calories: 127, protein: 9, carbs: 23, fat: 0.5, fiber: 6.4, unit: "per 100g cooked" },
  yogurt: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0, unit: "per 100g" },
  olive_oil: { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, unit: "per 100g" },
  sugar: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0, unit: "per 100g" },
};

export const nutritionCalculateTool: MCPTool = {
  name: "nutrition_calculate",
  description: "حساب معلومات غذائية من مكونات (محلي). استخدمها لما المستخدم يقول 'سعرات' أو 'nutrition' أو 'calories'.",
  parameters: {
    type: "object",
    properties: {
      ingredients: { type: "string", description: "المكونات (مثلاً: rice:200, chicken:150, tomato:50)" },
    },
    required: ["ingredients"],
  },
  async execute(params) {
    const input = String(params.ingredients || "").trim();
    if (!input) return { success: false, error: "ingredients مطلوبة" };
    try {
      const items = input.split(",").map((s) => s.trim()).filter(Boolean);
      let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0;
      const found: any[] = [];
      const notFound: string[] = [];
      items.forEach((item) => {
        const match = item.match(/^([\w\s]+?)(?::(\d+))?$/);
        if (!match) return;
        const name = match[1].trim().toLowerCase().replace(/\s+/g, "_");
        const grams = parseInt(match[2] || "100");
        const data = NUTRITION_DB[name];
        if (data) {
          const factor = grams / 100;
          const itemNutrition = {
            name: match[1].trim(),
            grams,
            calories: Math.round(data.calories * factor),
            protein: Math.round(data.protein * factor * 10) / 10,
            carbs: Math.round(data.carbs * factor * 10) / 10,
            fat: Math.round(data.fat * factor * 10) / 10,
            fiber: Math.round(data.fiber * factor * 10) / 10,
          };
          found.push(itemNutrition);
          totalCalories += itemNutrition.calories;
          totalProtein += itemNutrition.protein;
          totalCarbs += itemNutrition.carbs;
          totalFat += itemNutrition.fat;
          totalFiber += itemNutrition.fiber;
        } else {
          notFound.push(match[1].trim());
        }
      });
      const totalGrams = found.reduce((s, f) => s + f.grams, 0);
      return {
        success: true,
        data: {
          input,
          ingredients_found: found.length,
          ingredients_not_found: notFound,
          not_found_list: notFound,
          total: {
            grams: totalGrams,
            calories: Math.round(totalCalories),
            protein: Math.round(totalProtein * 10) / 10,
            carbs: Math.round(totalCarbs * 10) / 10,
            fat: Math.round(totalFat * 10) / 10,
            fiber: Math.round(totalFiber * 10) / 10,
          },
          per_100g: totalGrams > 0 ? {
            calories: Math.round((totalCalories / totalGrams) * 100),
            protein: Math.round((totalProtein / totalGrams) * 1000) / 10,
            carbs: Math.round((totalCarbs / totalGrams) * 1000) / 10,
            fat: Math.round((totalFat / totalGrams) * 1000) / 10,
          } : null,
          ingredients: found,
          available_foods: Object.keys(NUTRITION_DB),
          note: "القيم تقريبية. لتحليل دقيق استخدم nutritionix أو Edamam API.",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
