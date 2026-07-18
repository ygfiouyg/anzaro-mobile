/**
 * MCP Tool: CoinGecko Trending
 * تكامل حقيقي مع CoinGecko API — trending coins.
 */
import type { MCPTool } from "../types";

export const coingeckoTrendingTool: MCPTool = {
  name: "coingecko_trending",
  description: "trending coins من CoinGecko (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'trending crypto' أو 'ترند كريبتو'.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/search/trending", {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `CoinGecko API error ${res.status}` };

      const data: any = await res.json();
      const coins = (data.coins || []).map((c: any) => ({
        item: {
          id: c.item?.id || "",
          coin_id: c.item?.coin_id || 0,
          name: c.item?.name || "",
          symbol: (c.item?.symbol || "").toUpperCase(),
          market_cap_rank: c.item?.market_cap_rank || null,
          thumb: c.item?.thumb || "",
          small: c.item?.small || "",
          large: c.item?.large || "",
          slug: c.item?.slug || "",
          price_btc: c.item?.price_btc || 0,
          score: c.item?.score || 0,
          data: c.item?.data ? {
            price: c.item.data.price || 0,
            price_btc: c.item.data.price_btc || "",
            price_change_percentage_24h: c.item.data.price_change_percentage_24h?.usd || 0,
            market_cap: c.item.data.market_cap || "",
            total_volume: c.item.data.total_volume || "",
            sparkline: c.item.data.sparkline || "",
          } : null,
        },
      }));

      const categories = (data.categories || []).map((cat: any) => ({
        id: cat.id || 0,
        name: cat.name || "",
        market_cap_1h_change: cat.market_cap_1h_change || 0,
        slug: cat.slug || "",
        coins_count: cat.coins_count || 0,
        data: cat.data ? {
          market_cap: cat.data.market_cap || 0,
          market_cap_btc: cat.data.market_cap_btc || 0,
          total_volume: cat.data.total_volume || 0,
          total_volume_btc: cat.data.total_volume_btc || 0,
          market_cap_change_percentage_24h: cat.data.market_cap_change_percentage_24h?.usd || 0,
        } : null,
      }));

      const nfts = (data.nfts || []).map((n: any) => ({
        id: n.id || "",
        name: n.name || "",
        symbol: n.symbol || "",
        thumb: n.thumb || "",
        nft_contract_id: n.nft_contract_id || 0,
        native_currency_symbol: n.native_currency_symbol || "",
        floor_price: n.data?.floor_price || "",
        h24_volume: n.data?.h24_volume || "",
        h24_average_sale_price: n.data?.h24_average_sale_price || "",
      }));

      return {
        success: true,
        data: {
          trending_coins: coins,
          trending_categories: categories,
          trending_nfts: nfts,
          total_coins: coins.length,
          total_categories: categories.length,
          total_nfts: nfts.length,
          source: "coingecko.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
