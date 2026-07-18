/**
 * MCP Tool: CoinGecko DeFi
 * تكامل حقيقي مع CoinGecko API — DeFi platforms + stats.
 */
import type { MCPTool } from "../types";

export const coingeckoDefiTool: MCPTool = {
  name: "coingecko_defi",
  description: "DeFi stats + platforms (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'defi' أو 'decentralized finance'.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", description: "stats أو platforms (افتراضي: stats)", default: "stats" },
      count: { type: "number", description: "عدد platforms (افتراضي: 10، أقصى: 50)", default: 10 },
    },
    required: [],
  },
  async execute(params) {
    const type = String(params.type || "stats").toLowerCase();
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));
    try {
      if (type === "platforms" || type === "list") {
        const res = await fetch("https://api.coingecko.com/api/v3/asset_platforms", {
          headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { success: false, error: `CoinGecko error ${res.status}` };
        const data: any[] = await res.json();
        const platforms = data.slice(0, count).map((p: any) => ({
          id: p.id,
          chain_identifier: p.chain_identifier || null,
          name: p.name || "",
          short: p.short || "",
        }));
        return {
          success: true,
          data: {
            type: "platforms",
            total: data.length,
            shown: platforms.length,
            platforms,
            source: "coingecko.com",
          },
        };
      }
      // stats
      const res = await fetch("https://api.coingecko.com/api/v3/global/decentralized_finance_defi", {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: `CoinGecko error ${res.status}` };
      const data: any = await res.json();
      const d = data.data || {};
      return {
        success: true,
        data: {
          type: "stats",
          defi_market_cap: Math.round((d.defi_market_cap || 0) / 1e9 * 100) / 100 + "B",
          eth_market_cap: Math.round((d.eth_market_cap || 0) / 1e9 * 100) / 100 + "B",
          defi_to_eth_ratio: Math.round((d.defi_dominance || 0) * 100) / 100 + "%",
          trading_volume_24h: Math.round((d.trading_volume_24h || 0) / 1e9 * 100) / 100 + "B",
          defi_dominance: Math.round((d.defi_dominance || 0) * 100) / 100 + "%",
          top_coin: d.top_coin_name || "",
          top_coin_dominance: Math.round((d.top_coin_dominance || 0) * 100) / 100 + "%",
          source: "coingecko.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
