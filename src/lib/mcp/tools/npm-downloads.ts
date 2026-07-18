/**
 * MCP Tool: npm Downloads Stats
 * تكامل حقيقي مع npm registry downloads API (مجاني تماماً).
 * بيرجّع إحصائيات تحميل أي package.
 */
import type { MCPTool } from "../types";

export const npmDownloadsTool: MCPTool = {
  name: "npm_downloads",
  description: "إحصائيات تحميل npm package (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'downloads' أو 'npm stats' أو 'تحميلات'.",
  parameters: {
    type: "object",
    properties: {
      package: { type: "string", description: "اسم الـ package (مثلاً: react, next, express)" },
      period: {
        type: "string",
        description: "الفترة: last-day, last-week, last-month, last-year (افتراضي: last-month)",
        default: "last-month",
      },
    },
    required: ["package"],
  },
  async execute(params) {
    const pkg = String(params.package || "").trim();
    const period = String(params.period || "last-month").toLowerCase();

    if (!pkg) return { success: false, error: "package مطلوب" };
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._@/-]*$/.test(pkg)) {
      return { success: false, error: "صيغة اسم الـ package غير صحيحة" };
    }

    const validPeriods = ["last-day", "last-week", "last-month", "last-year"];
    const selPeriod = validPeriods.includes(period) ? period : "last-month";

    try {
      // 1) إجمالي التحميلات للفترة
      const url = `https://api.npmjs.org/downloads/point/${selPeriod}/${encodeURIComponent(pkg)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `npm stats API error ${res.status}` };
      }

      const data: any = await res.json();

      // 2) تاريخ التحميلات اليومية للفترة (للرسم البياني)
      let dailyDownloads: any[] = [];
      let rangeData: any = null;
      try {
        const rangeUrl = `https://api.npmjs.org/downloads/range/${selPeriod}/${encodeURIComponent(pkg)}`;
        const rangeRes = await fetch(rangeUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (rangeRes.ok) {
          rangeData = await rangeRes.json();
          dailyDownloads = (rangeData.downloads || []).slice(-30); // آخر 30 يوم
        }
      } catch {}

      // 3) مقارنة بالفترة السابقة (نفس المدة قبل)
      let previousPeriod: any = null;
      try {
        const start = new Date(data.start);
        const end = new Date(data.end);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - days);

        const prevUrl = `https://api.npmjs.org/downloads/point/${prevStart.toISOString().split("T")[0]}:${prevEnd.toISOString().split("T")[0]}/${encodeURIComponent(pkg)}`;
        const prevRes = await fetch(prevUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (prevRes.ok) {
          previousPeriod = await prevRes.json();
        }
      } catch {}

      // حساب الإحصائيات
      const currentDownloads = data.downloads || 0;
      const previousDownloads = previousPeriod?.downloads || 0;
      const change = currentDownloads - previousDownloads;
      const changePercent = previousDownloads > 0 ? (change / previousDownloads) * 100 : 0;

      // متوسط يومي
      const daysCount = dailyDownloads.length || 1;
      const avgDaily = Math.round(currentDownloads / daysCount);

      // max/min
      let maxDay: any = null;
      let minDay: any = null;
      if (dailyDownloads.length > 0) {
        maxDay = dailyDownloads.reduce((max, d) => (d.downloads > max.downloads ? d : max), dailyDownloads[0]);
        minDay = dailyDownloads.reduce((min, d) => (d.downloads < min.downloads ? d : min), dailyDownloads[0]);
      }

      return {
        success: true,
        data: {
          package: data.package || pkg,
          period: selPeriod,
          start: data.start || "",
          end: data.end || "",
          total_downloads: currentDownloads,
          avg_daily: avgDaily,
          previous_period_downloads: previousDownloads || null,
          change: previousDownloads > 0 ? change : null,
          change_percent: previousDownloads > 0 ? Math.round(changePercent * 100) / 100 : null,
          trend: change > 0 ? "صاعد" : change < 0 ? "هابط" : "ثابت",
          max_day: maxDay ? { date: maxDay.day, downloads: maxDay.downloads } : null,
          min_day: minDay ? { date: minDay.day, downloads: minDay.downloads } : null,
          daily_downloads: dailyDownloads.slice(-30),
          source: "api.npmjs.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
