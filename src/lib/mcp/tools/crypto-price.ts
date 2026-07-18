/**
 * MCP Tool: Crypto Price
 * تكامل حقيقي مع CoinGecko API (مجاني تماماً، بدون API key).
 * بيجيب أسعار العملات الرقمية + market cap + تغييرات.
 */
import type { MCPTool } from "../types";

export const cryptoPriceTool: MCPTool = {
  name: "crypto_price",
  description: "أسعار العملات الرقمية + market cap (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'كريبتو' أو 'bitcoin' أو 'بيتكوين'.",
  parameters: {
    type: "object",
    properties: {
      coin: { type: "string", description: "اسم/ID العملة (مثلاً: bitcoin, ethereum, solana)" },
      currency: { type: "string", description: "عملة التحويل: usd, eur, egp... (افتراضي: usd)", default: "usd" },
    },
    required: ["coin"],
  },
  async execute(params) {
    const coinInput = String(params.coin || "").toLowerCase().trim();
    const currency = String(params.currency || "usd").toLowerCase().trim();
    if (!coinInput) return { success: false, error: "coin مطلوب" };

    try {
      // خرائط الأسماء الشائعة لـ IDs بتاعة CoinGecko
      const coinMap: Record<string, string> = {
        btc: "bitcoin",
        bitcoin: "bitcoin",
        بيتكوين: "bitcoin",
        eth: "ethereum",
        ethereum: "ethereum",
        إيثيريوم: "ethereum",
        sol: "solana",
        solana: "solana",
        ada: "cardano",
        cardano: "cardano",
        doge: "dogecoin",
        dogecoin: "dogecoin",
        xrp: "ripple",
        ripple: "ripple",
        dot: "polkadot",
        polkadot: "polkadot",
        matic: "matic-network",
        link: "chainlink",
        chainlink: "chainlink",
        ltc: "litecoin",
        litecoin: "litecoin",
        bnb: "binancecoin",
        usdt: "tether",
        tether: "tether",
        avax: "avalanche-2",
        shib: "shiba-inu",
      };

      const coinId = coinMap[coinInput] || coinInput;

      // CoinGecko: /coins/{id} — معلومات تفصيلية
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "DeltaAI-MCP/1.0",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        if (res.status === 404) {
          return {
            success: false,
            error: `العملة "${coinInput}" مش موجودة. جرّب: bitcoin, ethereum, solana, cardano, dogecoin, ripple, litecoin`,
          };
        }
        return { success: false, error: `CoinGecko API error ${res.status}` };
      }

      const data: any = await res.json();
      const md = data.market_data || {};
      const prices = md.current_price || {};
      const changes = md.price_change_percentage_24h_in_currency || {};

      return {
        success: true,
        data: {
          id: data.id || coinId,
          name: data.name || "",
          symbol: (data.symbol || "").toUpperCase(),
          image: data.image?.large || data.image?.thumb || null,
          current_price: prices[currency] || null,
          currency: currency.toUpperCase(),
          market_cap: md.market_cap?.[currency] || null,
          market_cap_rank: md.market_cap_rank || null,
          total_volume: md.total_volume?.[currency] || null,
          high_24h: md.high_24h?.[currency] || null,
          low_24h: md.low_24h?.[currency] || null,
          price_change_24h: md.price_change_24h_in_currency?.[currency] || null,
          price_change_percentage_24h: md.price_change_percentage_24h_in_currency?.[currency] || changes.usd || null,
          price_change_percentage_7d: md.price_change_percentage_7d || null,
          price_change_percentage_30d: md.price_change_percentage_30d || null,
          circulating_supply: md.circulating_supply || null,
          total_supply: md.total_supply || null,
          max_supply: md.max_supply || null,
          ath: md.ath?.[currency] || null,
          ath_date: md.ath_date?.[currency] || null,
          atl: md.atl?.[currency] || null,
          last_updated: md.last_updated || "",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
