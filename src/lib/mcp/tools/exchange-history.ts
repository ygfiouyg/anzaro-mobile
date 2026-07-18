/**
 * MCP Tool: Exchange Rate History
 * تكامل حقيقي مع Frankfurter API (مجاني تماماً، بدون API key).
 * بيرجّع تاريخ أسعار الصرف لآخر N يوم أو فترة محددة.
 *
 * Frankfurter بيدعم: USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY, EGP, SAR, AED, إلخ
 */
import type { MCPTool } from "../types";

export const exchangeHistoryTool: MCPTool = {
  name: "exchange_history",
  description: "تاريخ أسعار صرف عملة لفترة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'تاريخ صرف' أو 'exchange history'.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "عملة المصدر (مثلاً: USD)" },
      to: { type: "string", description: "عملة الهدف (مثلاً: EGP)" },
      days: { type: "number", description: "عدد الأيام لآخر فترة (افتراضي: 30، أقصى: 365)", default: 30 },
    },
    required: ["from", "to"],
  },
  async execute(params) {
    const from = String(params.from || "").toUpperCase().trim();
    const to = String(params.to || "").toUpperCase().trim();
    const days = Math.min(365, Math.max(1, Number(params.days) || 30));

    if (!from || !to) return { success: false, error: "from و to مطلوبين" };
    if (from.length !== 3 || to.length !== 3) {
      return { success: false, error: "أكواد العملات لازم 3 حروف" };
    }

    try {
      // Frankfurter API — تاريخ آخر N يوم
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);

      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];

      const url = `https://api.frankfurter.app/${startStr}..${endStr}?from=${from}&to=${to}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { success: false, error: `Frankfurter API error ${res.status}` };
      }

      const data: any = await res.json();

      // بنا الـ history
      const rates: Record<string, number> = data.rates || {};
      const dates = Object.keys(rates).sort();
      const history: any[] = [];

      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let first = 0;
      let last = 0;

      dates.forEach((date, i) => {
        const rate = rates[date][to] || 0;
        if (rate > 0) {
          history.push({ date, rate });
          if (rate < min) min = rate;
          if (rate > max) max = rate;
          sum += rate;
          if (i === 0) first = rate;
          last = rate;
        }
      });

      const avg = history.length > 0 ? sum / history.length : 0;
      const change = last - first;
      const changePercent = first > 0 ? (change / first) * 100 : 0;

      return {
        success: true,
        data: {
          from,
          to,
          start_date: startStr,
          end_date: endStr,
          days: history.length,
          first_rate: first,
          last_rate: last,
          min_rate: min === Infinity ? 0 : min,
          max_rate: max === -Infinity ? 0 : max,
          avg_rate: Math.round(avg * 1000) / 1000,
          change: Math.round(change * 1000) / 1000,
          change_percent: Math.round(changePercent * 100) / 100,
          trend: change > 0 ? "صاعد" : change < 0 ? "هابط" : "ثابت",
          history,
          source: "frankfurter.app",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
