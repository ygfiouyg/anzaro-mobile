/**
 * MCP Tool: CoinGecko Coin History
 * تكامل حقيقي مع CoinGecko API — تاريخ سعر coin في تاريخ محدد.
 */
import type { MCPTool } from "../types";

export const coingeckoCoinHistoryTool: MCPTool = {
  name: "coingecko_coin_history",
  description: "سعر coin في تاريخ محدد (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'سعر bitcoin أمس' أو 'coin history'.",
  parameters: {
    type: "object",
    properties: {
      coin: { type: "string", description: "اسم/ID العملة (مثلاً: bitcoin, ethereum)" },
      date: { type: "string", description: "التاريخ بصيغة dd-mm-yyyy (مثلاً: 30-12-2022)" },
    },
    required: ["coin", "date"],
  },
  async execute(params) {
    const coin = String(params.coin || "").toLowerCase().trim();
    const date = String(params.date || "").trim();
    if (!coin || !date) return { success: false, error: "coin و date مطلوبين" };
    if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      return { success: false, error: "date لازم dd-mm-yyyy (مثلاً: 30-12-2022)" };
    }
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}/history?date=${date}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) return { success: false, error: `العملة "${coin}" مش موجودة` };
      if (!res.ok) return { success: false, error: `CoinGecko error ${res.status}` };
      const data: any = await res.json();
      const prices = data.market_data?.current_price || {};
      const mcaps = data.market_data?.market_cap || {};
      return {
        success: true,
        data: {
          coin: data.id || coin,
          name: data.name || "",
          symbol: (data.symbol || "").toUpperCase(),
          date,
          image: data.image?.large || data.image?.thumb || null,
          prices: Object.entries(prices).slice(0, 10).map(([cur, val]) => ({
            currency: cur.toUpperCase(),
            price: Math.round((val as number) * 100) / 100,
          })),
          market_caps: Object.entries(mcaps).slice(0, 5).map(([cur, val]) => ({
            currency: cur.toUpperCase(),
            market_cap: Math.round((val as number) / 1e9 * 100) / 100 + "B",
          })),
          community_data: data.community_data || null,
          source: "coingecko.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
