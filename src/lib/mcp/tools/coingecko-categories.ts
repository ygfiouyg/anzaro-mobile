/**
 * MCP Tool: CoinGecko Categories
 * تكامل حقيقي مع CoinGecko API — crypto categories.
 */
import type { MCPTool } from "../types";

export const coingeckoCategoriesTool: MCPTool = {
  name: "coingecko_categories",
  description: "crypto categories + top coins (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'crypto categories' أو 'تصنيفات كريبتو'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد التصنيفات (افتراضي: 10، أقصى: 50)", default: 10 },
      order: { type: "string", description: "market_cap_desc, volume_desc, name_asc (افتراضي: market_cap_desc)", default: "market_cap_desc" },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));
    const order = String(params.order || "market_cap_desc").toLowerCase();
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/categories?order=${order}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { success: false, error: `CoinGecko error ${res.status}` };
      const data: any[] = await res.json();
      const categories = data.slice(0, count).map((c: any) => ({
        id: c.id,
        name: c.name,
        market_cap: c.market_cap || 0,
        market_cap_24h_change: Math.round((c.market_cap_change_24h || 0) * 100) / 100,
        volume_24h: c.volume_24h || 0,
        top_3_coins: c.top_3_coins || [],
        content: c.content || "",
      }));
      return {
        success: true,
        data: {
          order,
          total_categories: data.length,
          shown: categories.length,
          categories,
          top_category: categories[0] || null,
          source: "coingecko.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
