/**
 * MCP Tool: CoinGecko Markets
 * تكامل حقيقي مع CoinGecko API — top coins + market data.
 */
import type { MCPTool } from "../types";

export const coingeckoMarketsTool: MCPTool = {
  name: "coingecko_markets",
  description: "top coins + market data من CoinGecko (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'crypto markets' أو 'top coins'.",
  parameters: {
    type: "object",
    properties: {
      currency: { type: "string", description: "عملة التحويل (افتراضي: usd)", default: "usd" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 250)", default: 10 },
      order: { type: "string", description: "market_cap_desc, volume_desc, id_asc (افتراضي: market_cap_desc)", default: "market_cap_desc" },
    },
    required: [],
  },
  async execute(params) {
    const currency = String(params.currency || "usd").toLowerCase();
    const count = Math.min(250, Math.max(1, Number(params.count) || 10));
    const order = String(params.order || "market_cap_desc").toLowerCase();

    try {
      const params2 = new URLSearchParams({
        vs_currency: currency,
        order,
        per_page: String(count),
        page: "1",
        sparkline: "false",
        price_change_percentage: "1h,24h,7d",
      });

      const url = `https://api.coingecko.com/api/v3/coins/markets?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `CoinGecko API error ${res.status}` };

      const data: any[] = await res.json();
      const coins = data.map((c: any) => ({
        id: c.id,
        symbol: (c.symbol || "").toUpperCase(),
        name: c.name,
        image: c.image || "",
        current_price: c.current_price,
        market_cap: c.market_cap,
        market_cap_rank: c.market_cap_rank,
        total_volume: c.total_volume,
        high_24h: c.high_24h,
        low_24h: c.low_24h,
        price_change_24h: c.price_change_24h,
        price_change_percentage_1h: c.price_change_percentage_1h_in_currency,
        price_change_percentage_24h: c.price_change_percentage_24h_in_currency,
        price_change_percentage_7d: c.price_change_percentage_7d_in_currency,
        circulating_supply: c.circulating_supply,
        total_supply: c.total_supply,
        max_supply: c.max_supply,
        ath: c.ath,
        ath_change_percentage: c.ath_change_percentage,
        atl: c.atl,
        last_updated: c.last_updated,
      }));

      return {
        success: true,
        data: {
          currency: currency.toUpperCase(),
          order,
          total: coins.length,
          coins,
          source: "coingecko.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
