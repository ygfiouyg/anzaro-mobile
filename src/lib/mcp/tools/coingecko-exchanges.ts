/**
 * MCP Tool: CoinGecko Exchanges
 * تكامل حقيقي مع CoinGecko API — list exchanges.
 */
import type { MCPTool } from "../types";

export const coingeckoExchangesTool: MCPTool = {
  name: "coingecko_exchanges",
  description: "list crypto exchanges (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'crypto exchanges' أو 'منصات تداول'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
      page: { type: "number", description: "رقم الصفحة (افتراضي: 1)", default: 1 },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const page = Math.max(1, Number(params.page) || 1);
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/exchanges?per_page=${count}&page=${page}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { success: false, error: `CoinGecko error ${res.status}` };
      const data: any[] = await res.json();
      const exchanges = data.map((e: any) => ({
        id: e.id,
        name: e.name,
        year_established: e.year_established || null,
        country: e.country || "",
        description: e.description || "",
        url: e.url || "",
        image: e.image || "",
        has_trading_incentive: e.has_trading_incentive || false,
        trust_score: e.trust_score || 0,
        trust_score_rank: e.trust_score_rank || 0,
        trade_volume_24h_btc: Math.round((e.trade_volume_24h_btc || 0) * 100) / 100,
        trade_volume_24h_btc_normalized: Math.round((e.trade_volume_24h_btc_normalized || 0) * 100) / 100,
      }));
      return {
        success: true,
        data: {
          page,
          total: exchanges.length,
          exchanges,
          top_exchange: exchanges[0] || null,
          source: "coingecko.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
