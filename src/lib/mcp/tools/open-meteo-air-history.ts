/**
 * MCP Tool: Open-Meteo Air Quality History
 * تكامل حقيقي مع Open-Meteo Air Quality Archive API (مجاني).
 */
import type { MCPTool } from "../types";

export const openMeteoAirHistoryTool: MCPTool = {
  name: "open_meteo_air_history",
  description: "تاريخ جودة الهواء (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'air quality history' أو 'تاريخ تلوث'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      city: { type: "string", description: "اسم المدينة" },
      startDate: { type: "string", description: "تاريخ البداية YYYY-MM-DD" },
      endDate: { type: "string", description: "تاريخ النهاية YYYY-MM-DD" },
    },
    required: ["startDate"],
  },
  async execute(params) {
    let lat = Number(params.lat);
    let lng = Number(params.lng);
    const city = String(params.city || "").trim();
    const startDate = String(params.startDate || "").trim();
    const endDate = String(params.endDate || startDate).trim();
    if (!startDate) return { success: false, error: "startDate مطلوبة" };
    try {
      if (city && (isNaN(lat) || isNaN(lng))) {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`, { signal: AbortSignal.timeout(10000) });
        if (geoRes.ok) { const d: any = await geoRes.json(); if (d.results?.[0]) { lat = d.results[0].latitude; lng = d.results[0].longitude; } }
      }
      if (isNaN(lat) || isNaN(lng)) return { success: false, error: "lat/lng أو city مطلوبين" };
      const params2 = new URLSearchParams({ latitude: String(lat), longitude: String(lng), start_date: startDate, end_date: endDate, hourly: "pm10,pm2_5,european_aqi,us_aqi", timezone: "auto" });
      const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params2.toString()}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const hourly = data.hourly || {};
      const times = hourly.time || [];
      const days: any[] = [];
      let lastDate = "";
      times.forEach((t: string, i: number) => {
        const day = t.split("T")[0];
        if (day !== lastDate) {
          days.push({ date: day, pm10: hourly.pm10?.[i], pm2_5: hourly.pm2_5?.[i], european_aqi: hourly.european_aqi?.[i], us_aqi: hourly.us_aqi?.[i] });
          lastDate = day;
        }
      });
      return { success: true, data: { location: { lat, lng, city: city || null }, start_date: startDate, end_date: endDate, days, source: "air-quality-api.open-meteo.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
