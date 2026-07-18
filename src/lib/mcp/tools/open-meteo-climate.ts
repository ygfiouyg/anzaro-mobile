/**
 * MCP Tool: Open-Meteo Climate
 * تكامل حقيقي مع Open-Meteo Climate API (مجاني).
 * بيرجّع بيانات مناخية لـ أي موقع.
 */
import type { MCPTool } from "../types";

export const openMeteoClimateTool: MCPTool = {
  name: "open_meteo_climate",
  description: "بيانات مناخية لأي موقع (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'climate' أو 'مناخ' أو 'تغير مناخي'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" }, lng: { type: "number", description: "خط الطول" }, city: { type: "string", description: "اسم المدينة" },
      startDate: { type: "string", description: "تاريخ البداية YYYY-MM-DD" },
      endDate: { type: "string", description: "تاريخ النهاية YYYY-MM-DD" },
    },
    required: ["startDate", "endDate"],
  },
  async execute(params) {
    let lat = Number(params.lat); let lng = Number(params.lng);
    const city = String(params.city || "").trim();
    const startDate = String(params.startDate || "").trim();
    const endDate = String(params.endDate || "").trim();
    if (!startDate || !endDate) return { success: false, error: "startDate و endDate مطلوبين" };
    try {
      if (city && (isNaN(lat) || isNaN(lng))) {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`, { signal: AbortSignal.timeout(10000) });
        if (geoRes.ok) { const d: any = await geoRes.json(); if (d.results?.[0]) { lat = d.results[0].latitude; lng = d.results[0].longitude; } }
      }
      if (isNaN(lat) || isNaN(lng)) return { success: false, error: "lat/lng أو city مطلوبين" };
      const params2 = new URLSearchParams({
        latitude: String(lat), longitude: String(lng),
        start_date: startDate, end_date: endDate,
        daily: "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,snowfall_sum,wind_speed_10m_max,shortwave_radiation_sum",
        timezone: "auto",
      });
      const res = await fetch(`https://climate-api.open-meteo.com/v1/climate?${params2.toString()}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const daily = data.daily || {};
      const dates = daily.time || [];
      const days: any[] = [];
      for (let i = 0; i < dates.length; i++) {
        days.push({ date: dates[i], temp_max: daily.temperature_2m_max?.[i], temp_min: daily.temperature_2m_min?.[i], temp_mean: daily.temperature_2m_mean?.[i], precipitation: daily.precipitation_sum?.[i] || 0, snowfall: daily.snowfall_sum?.[i] || 0, wind_max: daily.wind_speed_10m_max?.[i] || 0, radiation: daily.shortwave_radiation_sum?.[i] || 0 });
      }
      const avgMax = days.length > 0 ? days.reduce((s, d) => s + (d.temp_max || 0), 0) / days.length : 0;
      const avgMin = days.length > 0 ? days.reduce((s, d) => s + (d.temp_min || 0), 0) / days.length : 0;
      const totalPrecip = days.reduce((s, d) => s + (d.precipitation || 0), 0);
      return { success: true, data: { location: { lat, lng, city: city || null }, start_date: startDate, end_date: endDate, days_count: days.length, summary: { avg_max_temp: Math.round(avgMax * 10) / 10, avg_min_temp: Math.round(avgMin * 10) / 10, total_precipitation: Math.round(totalPrecip * 10) / 10 }, daily: days, source: "climate-api.open-meteo.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
