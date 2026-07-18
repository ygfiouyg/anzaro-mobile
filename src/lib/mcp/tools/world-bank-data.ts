/**
 * MCP Tool: World Bank Data
 * تكامل حقيقي مع World Bank Data API (مجاني، بدون API key).
 * بيرجّع مؤشرات اقتصادية لأي دولة.
 */
import type { MCPTool } from "../types";

export const worldBankTool: MCPTool = {
  name: "world_bank_data",
  description: "مؤشرات اقتصادية من World Bank (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'اقتصاد' أو 'world bank' أو 'gdp'.",
  parameters: {
    type: "object",
    properties: {
      country: { type: "string", description: "كود الدولة (مثلاً: EGY, USA, SAU)" },
      indicator: { type: "string", description: "كود المؤشر (افتراضي: NY.GDP.MKTP.CD = GDP)", default: "NY.GDP.MKTP.CD" },
      years: { type: "number", description: "عدد السنوات الأخيرة (افتراضي: 5)", default: 5 },
    },
    required: ["country"],
  },
  async execute(params) {
    const country = String(params.country || "").toUpperCase().trim();
    const indicator = String(params.indicator || "NY.GDP.MKTP.CD").trim();
    const years = Math.min(50, Math.max(1, Number(params.years) || 5));

    if (!country) return { success: false, error: "country مطلوب" };

    try {
      const dateRange = `${new Date().getFullYear() - years}:${new Date().getFullYear()}`;
      const params2 = new URLSearchParams({
        format: "json",
        date: dateRange,
        per_page: String(years + 1),
        order: "desc",
      });

      const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `World Bank API error ${res.status}` };

      const data: any = await res.json();
      if (!Array.isArray(data) || data.length < 2) {
        return { success: false, error: "استجابة غير متوقعة" };
      }

      const meta = data[0] || {};
      const records = (data[1] || []).filter((r: any) => r.value !== null).map((r: any) => ({
        year: r.date || "",
        value: r.value,
        unit: r.unit || "",
        indicator: r.indicator?.value || "",
        country: r.country?.value || "",
        country_code: r.countryiso3code || "",
      }));

      // get indicator info
      const indicators: Record<string, string> = {
        "NY.GDP.MKTP.CD": "GDP (current US$)",
        "NY.GDP.PCAP.CD": "GDP per capita (current US$)",
        "SP.POP.TOTL": "Population total",
        "EN.POP.DNST": "Population density",
        "SP.DYN.LE00.IN": "Life expectancy at birth",
        "SE.ADT.LITR.ZS": "Literacy rate",
        "SI.POV.GINI": "Gini index",
        "FP.CPI.TOTL.ZG": "Inflation, consumer prices",
        "GC.XPN.TOTL.GD.ZS": "Expense (% of GDP)",
        "NE.TRD.GNFS.ZS": "Trade (% of GDP)",
        "EG.USE.ELEC.KH.PC": "Electric power consumption (kWh per capita)",
        "IT.NET.USER.ZS": "Individuals using the Internet (% of population)",
        "EN.ATM.CO2E.PC": "CO2 emissions (metric tons per capita)",
      };

      return {
        success: true,
        data: {
          country: records[0]?.country || country,
          country_code: country,
          indicator_code: indicator,
          indicator_name: indicators[indicator] || records[0]?.indicator || "",
          years_returned: records.length,
          records,
          latest: records[0] || null,
          trend: calculateTrend(records),
          source: "api.worldbank.org",
          available_indicators: Object.entries(indicators).map(([code, name]) => ({ code, name })),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function calculateTrend(records: any[]): string {
  if (records.length < 2) return "بيانات غير كافية";
  const values = records.map((r) => r.value).filter((v) => v !== null);
  if (values.length < 2) return "بيانات غير كافية";
  const recent = values[0];
  const older = values[values.length - 1];
  const change = ((recent - older) / older) * 100;
  if (change > 5) return `نمو ${Math.round(change * 10) / 10}%`;
  if (change > 0) return `نمو طفيف ${Math.round(change * 10) / 10}%`;
  if (change < -5) return `انخفاض ${Math.round(Math.abs(change) * 10) / 10}%`;
  if (change < 0) return `انخفاض طفيف ${Math.round(Math.abs(change) * 10) / 10}%`;
  return "ثابت";
}
