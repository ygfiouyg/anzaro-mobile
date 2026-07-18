/**
 * MCP Tool: UV Index Forecast
 * تكامل حقيقي مع Open-Meteo API — مؤشر UV.
 */
import type { MCPTool } from "../types";

export const uvIndexTool: MCPTool = {
  name: "uv_index",
  description: "مؤشر الأشعة فوق البنفسجية (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'UV' أو 'أشعة شمس' أو 'حماية شمس'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" }, lng: { type: "number", description: "خط الطول" }, city: { type: "string", description: "اسم المدينة" },
    },
    required: [],
  },
  async execute(params) {
    let lat = Number(params.lat); let lng = Number(params.lng); const city = String(params.city || "").trim();
    try {
      if (city && (isNaN(lat) || isNaN(lng))) {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`, { signal: AbortSignal.timeout(10000) });
        if (geoRes.ok) { const d: any = await geoRes.json(); if (d.results?.[0]) { lat = d.results[0].latitude; lng = d.results[0].longitude; } }
      }
      if (isNaN(lat) || isNaN(lng)) return { success: false, error: "lat/lng أو city مطلوبين" };
      const params2 = new URLSearchParams({ latitude: String(lat), longitude: String(lng), current: "uv_index", daily: "uv_index_max,uv_index_clear_sky_max", timezone: "auto" });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params2.toString()}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const current = data.current?.uv_index || 0;
      const dailyMax = data.daily?.uv_index_max?.[0] || 0;
      const level = current < 3 ? "منخفض" : current < 6 ? "متوسط" : current < 8 ? "عالي" : current < 11 ? "عالي جداً" : "خطر";
      const advice = current < 3 ? "آمن — مفيش حاجة حماية" : current < 6 ? "استخدم واقي شمس SPF 30+" : current < 8 ? "واقي شمس + قبعة + نظارة" : current < 11 ? "تجنّب الشمس 10ص-4م" : "خطر — ابقَ بالداخل";
      return { success: true, data: { location: { lat, lng, city: city || null }, current_uv: current, daily_max_uv: dailyMax, level, advice, source: "open-meteo.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
