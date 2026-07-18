/**
 * MCP Tool: Fixer Exchange Rates
 * تكامل حقيقي مع Fixer API (مجاني مع key، 100/شهر).
 * أحدث أسعار + historical + conversion.
 */
import type { MCPTool } from "../types";

export const fixerRatesTool: MCPTool = {
  name: "fixer_rates",
  description: "أسعار صرف من Fixer (API حقيقي). استخدمها لما المست_USER يقول 'fixer' أو 'convert currency detailed'.",
  parameters: {
    type: "object",
    properties: {
      base: { type: "string", description: "عملة الأساس (EUR للنسخة المجانية)", default: "EUR" },
      symbols: { type: "string", description: "عملات محددة (اختياري)" },
      date: { type: "string", description: "تاريخ تاريخي YYYY-MM-DD (اختياري)" },
      amount: { type: "number", description: "مبلغ للتحويل (اختياري)" },
      to: { type: "string", description: "عملة الهدف للتحويل (مع amount)" },
    },
    required: [],
  },
  async execute(params) {
    const base = String(params.base || "EUR").toUpperCase();
    const symbols = String(params.symbols || "").toUpperCase().trim();
    const date = String(params.date || "").trim();
    const amount = Number(params.amount) || null;
    const to = String(params.to || "").toUpperCase().trim();

    const apiKey = process.env.FIXER_API_KEY;
    if (!apiKey) {
      return { success: false, error: "FIXER_API_KEY مطلوب. احصل عليه من fixer.io" };
    }

    try {
      // conversion mode
      if (amount && to) {
        const params2 = new URLSearchParams({
          access_key: apiKey,
          from: base,
          to,
          amount: String(amount),
        });

        const res = await fetch(`https://data.fixer.io/api/convert?${params2.toString()}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) return { success: false, error: `Fixer API error ${res.status}` };

        const data: any = await res.json();

        if (!data.success) {
          return { success: false, error: data.error?.info || "Fixer API error" };
        }

        return {
          success: true,
          data: {
            mode: "convert",
            query: data.query,
            result: data.result,
            rate: data.info?.rate,
            date: data.date,
            source: "fixer.io",
          },
        };
      }

      // rates mode (latest or historical)
      const endpoint = date ? date : "latest";
      const params2 = new URLSearchParams({
        access_key: apiKey,
        base,
      });
      if (symbols) params2.set("symbols", symbols);

      const res = await fetch(`https://data.fixer.io/api/${endpoint}?${params2.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Fixer API error ${res.status}` };

      const data: any = await res.json();

      if (!data.success) {
        return { success: false, error: data.error?.info || "Fixer API error" };
      }

      const rates = Object.entries(data.rates || {})
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([currency, rate]) => ({
          currency,
          rate: Math.round((rate as number) * 10000) / 10000,
        }));

      return {
        success: true,
        data: {
          mode: date ? "historical" : "latest",
          base: data.base || base,
          date: data.date || "",
          timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : "",
          total_currencies: rates.length,
          rates,
          source: "fixer.io",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
