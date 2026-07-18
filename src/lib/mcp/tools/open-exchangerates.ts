/**
 * MCP Tool: Open Exchangerates
 * تكامل حقيقي مع Open Exchangerates API (مجاني مع key، 1000/شهر).
 * أحدث أسعار العملات + historical.
 */
import type { MCPTool } from "../types";

export const openExchangeratesTool: MCPTool = {
  name: "open_exchangerates",
  description: "أسعار صرف من Open Exchangerates (API حقيقي). استخدمها لما المستخدم يقول 'exchange rates detailed' أو 'أسعار تفصيلية'.",
  parameters: {
    type: "object",
    properties: {
      base: { type: "string", description: "عملة الأساس (افتراضي: USD، النسخة المجانية USD فقط)", default: "USD" },
      symbols: { type: "string", description: "عملات محددة (اختياري، مفصولة بفواصل)" },
      date: { type: "string", description: "تاريخ تاريخي YYYY-MM-DD (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const base = String(params.base || "USD").toUpperCase();
    const symbols = String(params.symbols || "").toUpperCase().trim();
    const date = String(params.date || "").trim();

    const appId = process.env.OPENEXCHANGERATES_APP_ID;
    if (!appId) {
      return { success: false, error: "OPENEXCHANGERATES_APP_ID مطلوب. احصل عليه من openexchangerates.org" };
    }

    try {
      let url: string;
      if (date) {
        url = `https://openexchangerates.org/api/historical/${date}.json?app_id=${appId}&base=${base}`;
      } else {
        url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=${base}`;
      }
      if (symbols) url += `&symbols=${symbols}`;

      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        if (res.status === 401) return { success: false, error: "App ID غير صالح" };
        if (res.status === 429) return { success: false, error: "Rate limit exceeded" };
        return { success: false, error: `Open Exchangerates API error ${res.status}` };
      }

      const data: any = await res.json();

      // sort rates
      const rates = Object.entries(data.rates || {})
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([currency, rate]) => ({
          currency,
          rate: Math.round((rate as number) * 10000) / 10000,
          inverse: Math.round((1 / (rate as number)) * 10000) / 10000,
        }));

      return {
        success: true,
        data: {
          base: data.base || base,
          date: date || data.timestamp ? new Date(data.timestamp * 1000).toISOString().split("T")[0] : "",
          timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : "",
          total_currencies: rates.length,
          rates,
          highest: rates[0] || null,
          lowest: rates[rates.length - 1] || null,
          source: "openexchangerates.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
