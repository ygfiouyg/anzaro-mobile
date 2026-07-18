/**
 * MCP Tool: Open Food Facts Search
 * تكامل حقيقي مع Open Food Facts API (مجاني، بدون API key).
 * بيدوّر على منتجات غذائية + معلومات غذائية.
 */
import type { MCPTool } from "../types";

export const openfoodfactsSearchTool: MCPTool = {
  name: "openfoodfacts_search",
  description: "بحث في منتجات غذائية + معلومات (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'منتج غذائي' أو 'food facts'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5)", default: 5 },
      country: { type: "string", description: "كود الدولة (اختياري: eg, us, fr)" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 5));
    const country = String(params.country || "").toLowerCase().trim();
    if (!query) return { success: false, error: "query مطلوبة" };
    try {
      const params2 = new URLSearchParams({
        search_terms: query,
        page_size: String(count),
        page: "1",
        fields: "code,product_name,brands,categories,nutriments,image_url,image_front_url,quantity,allergens,ingredients_text,nutriscore_grade,ecoscore_grade,nova_group,countries",
      });
      const url = `https://${country || "world"}.openfoodfacts.org/cgi/search.pl?${params2.toString()}&json=1`;
      const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { success: false, error: `Open Food Facts error ${res.status}` };
      const data: any = await res.json();
      const products = (data.products || []).map((p: any) => ({
        barcode: p.code || "",
        name: p.product_name || "",
        brands: p.brands || "",
        categories: p.categories || "",
        quantity: p.quantity || "",
        image: p.image_url || p.image_front_url || "",
        allergens: p.allergens || "",
        ingredients: (p.ingredients_text || "").slice(0, 300),
        nutriscore: p.nutriscore_grade ? p.nutriscore_grade.toUpperCase() : null,
        ecoscore: p.ecoscore_grade ? p.ecoscore_grade.toUpperCase() : null,
        nova_group: p.nova_group || null,
        countries: p.countries || "",
        nutriments: {
          energy_100g: p.nutriments?.["energy-kcal_100g"] || p.nutriments?.energy_100g || null,
          fat_100g: p.nutriments?.fat_100g || null,
          carbs_100g: p.nutriments?.carbohydrates_100g || null,
          sugars_100g: p.nutriments?.sugars_100g || null,
          proteins_100g: p.nutriments?.proteins_100g || null,
          salt_100g: p.nutriments?.salt_100g || null,
        },
      }));
      return { success: true, data: { query, country: country || "world", total: data.count || 0, shown: products.length, products, source: "openfoodfacts.org" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
