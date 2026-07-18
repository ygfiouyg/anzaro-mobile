/**
 * MCP Tool: TheMealDB Search
 * تكامل حقيقي مع TheMealDB API (مجاني، بدون API key).
 * بيدوّر على وصفات طعام.
 */
import type { MCPTool } from "../types";

export const themealdbSearchTool: MCPTool = {
  name: "themealdb_search",
  description: "بحث في وصفات الطعام (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'وصفة' أو 'meal' أو 'اكل'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث (اختياري)" },
      random: { type: "boolean", description: "وصفة عشوائية (افتراضي: false)", default: false },
    },
    required: [],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const random = Boolean(params.random);
    try {
      let url: string;
      if (random) {
        url = "https://www.themealdb.com/api/json/v1/1/random.php";
      } else if (query) {
        url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`;
      } else {
        url = "https://www.themealdb.com/api/json/v1/1/random.php";
      }
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `TheMealDB error ${res.status}` };
      const data: any = await res.json();
      const meals = (data.meals || []).map((m: any) => {
        const ingredients: string[] = [];
        for (let i = 1; i <= 20; i++) {
          const ing = m[`strIngredient${i}`];
          const measure = m[`strMeasure${i}`];
          if (ing && ing.trim()) ingredients.push(`${measure?.trim() || ""} ${ing.trim()}`.trim());
        }
        return {
          id: m.idMeal,
          name: m.strMeal || "",
          category: m.strCategory || "",
          area: m.strArea || "",
          instructions: m.strInstructions || "",
          thumbnail: m.strMealThumb || "",
          youtube: m.strYoutube || "",
          source: m.strSource || "",
          ingredients,
        };
      });
      return { success: true, data: { query: query || "random", total: meals.length, meals, source: "themealdb.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
