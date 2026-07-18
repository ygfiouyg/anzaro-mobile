/**
 * MCP Tool: CocktailDB Search
 * تكامل حقيقي مع TheCocktailDB API (مجاني، بدون API key).
 * بيدوّر على وصفات كوكتيلات.
 */
import type { MCPTool } from "../types";

export const cocktaildbSearchTool: MCPTool = {
  name: "cocktaildb_search",
  description: "بحث في وصفات الكوكتيلات (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'كوكتيل' أو 'cocktail' أو 'مشروب'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "اسم الكوكتيل (اختياري)" },
      ingredient: { type: "string", description: "بحث بمكون (اختياري، مثلاً: vodka)" },
      random: { type: "boolean", description: "كوكتيل عشوائي (افتراضي: false)", default: false },
    },
    required: [],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const ingredient = String(params.ingredient || "").trim().toLowerCase();
    const random = Boolean(params.random);
    try {
      let url: string;
      if (random) url = "https://www.thecocktaildb.com/api/json/v1/1/random.php";
      else if (ingredient) url = `https://www.thecocktaildb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)}`;
      else if (query) url = `https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`;
      else url = "https://www.thecocktaildb.com/api/json/v1/1/random.php";

      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `CocktailDB error ${res.status}` };
      const data: any = await res.json();
      const drinks = (data.drinks || []).map((d: any) => {
        const ingredients: string[] = [];
        for (let i = 1; i <= 15; i++) {
          const ing = d[`strIngredient${i}`];
          const measure = d[`strMeasure${i}`];
          if (ing && ing.trim()) ingredients.push(`${measure?.trim() || ""} ${ing.trim()}`.trim());
        }
        return {
          id: d.idDrink,
          name: d.strDrink || "",
          category: d.strCategory || "",
          alcoholic: d.strAlcoholic || "",
          glass: d.strGlass || "",
          instructions: d.strInstructions || "",
          thumbnail: d.strDrinkThumb || "",
          ingredients,
        };
      });
      return { success: true, data: { query: query || ingredient || "random", total: drinks.length, drinks, source: "thecocktaildb.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
