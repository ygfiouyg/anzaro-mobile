/**
 * MCP Tool: Chuck Norris Facts
 * تكامل حقيقي مع Chuck Norris API (مجاني، بدون API key).
 * بيرجّع نكت Chuck Norris عشوائية.
 */
import type { MCPTool } from "../types";

export const chuckFactsTool: MCPTool = {
  name: "chuck_facts",
  description: "نكت Chuck Norris عشوائية (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'chuck norris' أو 'نكتة'.",
  parameters: {
    type: "object",
    properties: {
      category: { type: "string", description: "تصنيف محدد (اختياري)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 1، أقصى: 10)", default: 1 },
    },
    required: [],
  },
  async execute(params) {
    const category = String(params.category || "").trim().toLowerCase();
    const count = Math.min(10, Math.max(1, Number(params.count) || 1));

    try {
      const facts: any[] = [];

      for (let i = 0; i < count; i++) {
        const url = category
          ? `https://api.chucknorris.io/jokes/random?category=${encodeURIComponent(category)}`
          : "https://api.chucknorris.io/jokes/random";

        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          if (res.status === 404) {
            return { success: false, error: `التصنيف "${category}" مش موجود` };
          }
          return { success: false, error: `Chuck Norris API error ${res.status}` };
        }

        const data: any = await res.json();
        facts.push({
          id: data.id || "",
          value: data.value || "",
          url: data.url || "",
          icon: data.icon_url || "",
          categories: data.categories || [],
          created: data.created_at || "",
          updated: data.updated_at || "",
        });
      }

      // get categories list if no category specified
      let categories: string[] = [];
      if (!category && count === 1) {
        try {
          const catRes = await fetch("https://api.chucknorris.io/jokes/categories", {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (catRes.ok) {
            categories = await catRes.json();
          }
        } catch {}
      }

      return {
        success: true,
        data: {
          count: facts.length,
          category: category || null,
          facts,
          available_categories: categories.length > 0 ? categories : undefined,
          source: "api.chucknorris.io",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
