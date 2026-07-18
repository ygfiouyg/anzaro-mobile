/**
 * MCP Tool: Open-Meteo Elevation
 * تكامل حقيقي مع Open-Meteo Elevation API (مجاني).
 */
import type { MCPTool } from "../types";

export const openMeteoElevationTool: MCPTool = {
  name: "open_meteo_elevation",
  description: "ارتفاع أي موقع عن سطح البحر (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'elevation' أو 'ارتفاع' أو 'ارتفاع عن سطح البحر'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      city: { type: "string", description: "اسم المدينة" },
    },
    required: [],
  },
  async execute(params) {
    let lat = Number(params.lat);
    let lng = Number(params.lng);
    const city = String(params.city || "").trim();
    try {
      if (city && (isNaN(lat) || isNaN(lng))) {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`, { signal: AbortSignal.timeout(10000) });
        if (geoRes.ok) {
          const d: any = await geoRes.json();
          if (d.results?.[0]) { lat = d.results[0].latitude; lng = d.results[0].longitude; }
        }
      }
      if (isNaN(lat) || isNaN(lng)) return { success: false, error: "lat/lng أو city مطلوبين" };
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const elevation = data.elevation?.[0] || 0;
      return {
        success: true,
        data: {
          location: { lat, lng, city: city || null },
          elevation_meters: elevation,
          elevation_feet: Math.round(elevation * 3.28084),
          elevation_category: elevation < 100 ? "منخفض" : elevation < 500 ? "متوسط" : elevation < 1500 ? "مرتفع" : elevation < 3000 ? "جبلي" : "جبلي عالي",
          source: "open-meteo.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
