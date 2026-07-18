/**
 * MCP Tool: CoinGecko Global Stats
 * تكامل حقيقي مع CoinGecko API — إحصائيات crypto عالمية.
 */
import type { MCPTool } from "../types";

export const coingeckoGlobalTool: MCPTool = {
  name: "coingecko_global",
  description: "إحصائيات crypto عالمية (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'crypto global' أو 'إحصائيات crypto'.",
  parameters: { type: "object", properties: {}, required: [] },
  async execute() {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/global", {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: `CoinGecko error ${res.status}` };
      const data: any = await res.json();
      const d = data.data || {};
      const mcap = d.total_market_cap || {};
      const vol = d.total_volume || {};
      const dom = d.market_cap_percentage || {};
      return {
        success: true,
        data: {
          active_cryptocurrencies: d.active_cryptocurrencies || 0,
          markets: d.markets || 0,
          total_market_cap_usd: Math.round((mcap.usd || 0) / 1e12 * 100) / 100 + "T",
          total_volume_usd: Math.round((vol.usd || 0) / 1e9 * 100) / 100 + "B",
          market_cap_percentage: {
            btc: Math.round((dom.btc || 0) * 100) / 100,
            eth: Math.round((dom.eth || 0) * 100) / 100,
            usdt: Math.round((dom.usdt || 0) * 100) / 100,
          },
          market_cap_change_24h: Math.round((d.market_cap_change_percentage_24h_usd || 0) * 100) / 100,
          updated_at: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : "",
          source: "coingecko.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
