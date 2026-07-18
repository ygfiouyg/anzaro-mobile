/**
 * MCP Tool: Currency Converter
 * تكامل حقيقي مع open.er-api.com (مجاني، بدون API key).
 * بيحوّل عملة لأي عملة تانية بأسعار صرف حية.
 */
import type { MCPTool } from "../types";

export const currencyConvertTool: MCPTool = {
  name: "currency_convert",
  description: "حوّل عملة بأكثر من 160 عملة بأسعار صرف حية (API حقيقي). استخدمها لما المستخدم يقول 'صرف' أو 'currency' أو 'دولار'.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "المبلغ المطلوب تحويله" },
      from: { type: "string", description: "عملة المصدر (مثلاً: USD, EUR, EGP, SAR)" },
      to: { type: "string", description: "عملة الهدف (مثلاً: USD, EUR, EGP, SAR)" },
    },
    required: ["amount", "from", "to"],
  },
  async execute(params) {
    const amount = Number(params.amount);
    const from = String(params.from || "").toUpperCase().trim();
    const to = String(params.to || "").toUpperCase().trim();

    if (!amount && amount !== 0) return { success: false, error: "amount مطلوب (رقم)" };
    if (!from || !to) return { success: false, error: "from و to مطلوبين (أكواد ISO 4217)" };
    if (from.length !== 3 || to.length !== 3) {
      return { success: false, error: "أكواد العملات لازم 3 حروف (USD, EUR, EGP...)" };
    }

    try {
      // open.er-api.com مجاني تماماً ومش محتاج API key
      const url = `https://open.er-api.com/v6/latest/${from}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        return { success: false, error: `Currency API error ${res.status}` };
      }
      const data: any = await res.json();

      if (data.result !== "success") {
        return { success: false, error: `API رجّع: ${data["error-type"] || "unknown error"}` };
      }

      const rate = data.rates?.[to];
      if (!rate) {
        return {
          success: false,
          error: `عملة "${to}" مش موجودة. أكواد متاحة: ${Object.keys(data.rates || {}).slice(0, 20).join(", ")}...`,
        };
      }

      const converted = amount * rate;

      return {
        success: true,
        data: {
          amount,
          from,
          to,
          rate,
          converted: Math.round(converted * 100) / 100,
          updated: data.time_last_update_utc || "",
          next_update: data.time_next_update_utc || "",
          note: `1 ${from} = ${rate} ${to}`,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
