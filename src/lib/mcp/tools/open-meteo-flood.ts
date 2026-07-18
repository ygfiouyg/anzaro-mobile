/**
 * MCP Tool: Open-Meteo Flood
 * تكامل حقيقي مع Open-Meteo Flood API (مجاني).
 * بيرجّع توقعات فيضان النهر لأي موقع.
 */
import type { MCPTool } from "../types";

export const openMeteoFloodTool: MCPTool = {
  name: "open_meteo_flood",
  description: "توقعات فيضان النهر (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'flood' أو 'فيضان' أو 'نهر'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      days: { type: "number", description: "عدد الأيام (افتراضي: 7، أقصى: 30)", default: 7 },
    },
    required: ["lat", "lng"],
  },
  async execute(params) {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    const days = Math.min(30, Math.max(1, Number(params.days) || 7));
    if (isNaN(lat) || isNaN(lng)) return { success: false, error: "lat و lng مطلوبين" };
    try {
      const params2 = new URLSearchParams({
        latitude: String(lat), longitude: String(lng),
        daily: "river_discharge,river_discharge_median",
        forecast_days: String(days),
        timezone: "auto",
      });
      const res = await fetch(`https://flood-api.open-meteo.com/v1/flood?${params2.toString()}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const daily = data.daily || {};
      const dates = daily.time || [];
      const forecast: any[] = [];
      for (let i = 0; i < dates.length; i++) {
        const discharge = daily.river_discharge?.[i] || 0;
        const median = daily.river_discharge_median?.[i] || 0;
        const ratio = median > 0 ? discharge / median : 0;
        forecast.push({
          date: dates[i],
          river_discharge: discharge,
          median_discharge: median,
          flood_risk: ratio > 2 ? "عالي" : ratio > 1.5 ? "متوسط" : ratio > 1 ? "منخفض" : "طبيعي",
          ratio_to_median: Math.round(ratio * 100) / 100,
        });
      }
      return {
        success: true,
        data: {
          location: { lat, lng },
          timezone: data.timezone || "auto",
          days: forecast.length,
          forecast,
          highest_risk_day: [...forecast].sort((a, b) => b.ratio_to_median - a.ratio_to_median)[0] || null,
          source: "flood-api.open-meteo.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
