/**
 * MCP Tool: Stock Price
 * تكامل حقيقي مع stooq.com (مجاني، بدون API key).
 * بيرجّع أسعار الأسهم والعملات الرقمية.
 *
 * مثال على الرموز: AAPL, MSFT, GOOGL, TSLA, AMZN, META, NVDA
 * مؤشرات: ^DJI, ^GSPC (S&P 500), ^IXIC (NASDAQ)
 * كريبتو: btcusd, ethusd
 */
import type { MCPTool } from "../types";

export const stockPriceTool: MCPTool = {
  name: "stock_price",
  description: "أسعار الأسهم والمؤشرات والكريبتو (API حقيقي). استخدمها لما المستخدم يقول 'سهم' أو 'stock' أو 'بورصة' أو 'سعر'.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "رمز السهم (مثلاً: AAPL, MSFT, TSLA, BTC)" },
    },
    required: ["symbol"],
  },
  async execute(params) {
    const symbol = String(params.symbol || "").toUpperCase().trim();
    if (!symbol) return { success: false, error: "symbol مطلوبة" };

    try {
      // stooq.com مجاني تماماً — CSV format
      // قواعد الرموز:
      // - أسهم أمريكية: لازم .us (AAPL → aapl.us)
      // - كريبتو: btcusd (كما هو)
      // - مؤشرات: ^spx (كما هو)
      let query: string;
      if (symbol.startsWith("^")) {
        query = symbol.toLowerCase();
      } else if (/^(btc|eth|ltc|doge|xrp|ada|sol|dot|matic|link)(usd|eur)$/i.test(symbol)) {
        query = symbol.toLowerCase();
      } else if (symbol.includes(".")) {
        query = symbol.toLowerCase();
      } else {
        // افتراضي: أسهم أمريكية → ضيف .us
        query = `${symbol.toLowerCase()}.us`;
      }
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(query)}&f=sd2t2ohlcvn&h&e=csv`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return { success: false, error: `Stock API error ${res.status}` };
      }
      const csv = (await res.text()).trim();
      // CSV format: Symbol,Date,Time,Open,High,Low,Close,Volume,Name
      const lines = csv.split("\n");
      if (lines.length < 2) {
        return { success: false, error: `مفيش بيانات للرمز "${symbol}"` };
      }
      const cols = lines[1].split(",");
      if (cols.length < 9) {
        return { success: false, error: "استجابة غير متوقعة من الـ API" };
      }

      const [sym, date, time, open, high, low, close, volume, name] = cols;

      // لو الـ close فاضي → السهم مش موجود
      if (!close || close === "N/A") {
        return {
          success: false,
          error: `الرمز "${symbol}" مش موجود. جرّب: AAPL, MSFT, GOOGL, TSLA, AMZN, META, NVDA، أو مؤشرات: ^GSPC, ^DJI, ^IXIC، أو كريبتو: btcusd, ethusd`,
        };
      }

      const openNum = parseFloat(open) || 0;
      const closeNum = parseFloat(close) || 0;
      const highNum = parseFloat(high) || 0;
      const lowNum = parseFloat(low) || 0;
      const volumeNum = parseInt(volume) || 0;
      const change = closeNum - openNum;
      const changePercent = openNum > 0 ? (change / openNum) * 100 : 0;

      return {
        success: true,
        data: {
          symbol: sym || symbol,
          name: name || symbol,
          date: date || "",
          time: time || "",
          open: openNum,
          high: highNum,
          low: lowNum,
          close: closeNum,
          volume: volumeNum,
          change: Math.round(change * 100) / 100,
          change_percent: Math.round(changePercent * 100) / 100,
          trend: change >= 0 ? "▲ صاعد" : "▼ هابط",
          currency: "USD",
          source: "stooq.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
