/**
 * MCP Tool: Exchange Latest Rates
 * تكامل حقيقي مع Frankfurter API — أحدث أسعار الصرف لكل العملات.
 */
import type { MCPTool } from "../types";

export const exchangeLatestTool: MCPTool = {
  name: "exchange_latest",
  description: "أحدث أسعار الصرف لكل العملات (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'أسعار الصرف' أو 'exchange rates'.",
  parameters: {
    type: "object",
    properties: {
      base: { type: "string", description: "عملة الأساس (افتراضي: EUR)", default: "EUR" },
      symbols: { type: "string", description: "عملات محددة مفصولة بفواصل (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const base = String(params.base || "EUR").toUpperCase().trim();
    const symbols = String(params.symbols || "").toUpperCase().trim();

    if (base.length !== 3) return { success: false, error: "base لازم 3 حروف" };

    try {
      const params2 = new URLSearchParams();
      params2.set("base", base);
      if (symbols) params2.set("symbols", symbols);

      const url = `https://api.frankfurter.app/latest?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Frankfurter API error ${res.status}` };

      const data = await res.json() as { rates?: Record<string, number> };
      const rates = data.rates || {};

      // sort + format
      const sortedRates = Object.entries(rates)
        .sort(([, a], [, b]) => b - a)
        .map(([currency, rate]) => ({
          currency,
          rate: Math.round(rate * 10000) / 10000,
          inverse: Math.round((1 / rate) * 10000) / 10000,
        }));

      return {
        success: true,
        data: {
          base,
          date: data.date || "",
          total_currencies: sortedRates.length,
          rates: sortedRates,
          highest: sortedRates[0] || null,
          lowest: sortedRates[sortedRates.length - 1] || null,
          source: "frankfurter.app",
          note: "الأسعار مقابل 1 وحدة من عملة الأساس",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
