/**
 * MCP Tool: Open-Meteo Soil Temperature
 * تكامل حقيقي مع Open-Meteo API — soil temperature + moisture.
 */
import type { MCPTool } from "../types";

export const openMeteoSoilTool: MCPTool = {
  name: "open_meteo_soil",
  description: "حرارة ورطوبة التربة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'soil' أو 'تربة' أو 'زراعة'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" }, lng: { type: "number", description: "خط الطول" }, city: { type: "string", description: "اسم المدينة" },
    },
    required: [],
  },
  async execute(params) {
    let lat = Number(params.lat); let lng = Number(params.lng);
    const city = String(params.city || "").trim();
    try {
      if (city && (isNaN(lat) || isNaN(lng))) {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`, { signal: AbortSignal.timeout(10000) });
        if (geoRes.ok) { const d: any = await geoRes.json(); if (d.results?.[0]) { lat = d.results[0].latitude; lng = d.results[0].longitude; } }
      }
      if (isNaN(lat) || isNaN(lng)) return { success: false, error: "lat/lng أو city مطلوبين" };
      const params2 = new URLSearchParams({ latitude: String(lat), longitude: String(lng), current: "soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm", timezone: "auto" });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params2.toString()}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const c = data.current || {};
      return {
        success: true,
        data: {
          location: { lat, lng, city: city || null },
          current: {
            time: c.time,
            soil_temperature: { "0cm": c.soil_temperature_0cm, "6cm": c.soil_temperature_6cm, "18cm": c.soil_temperature_18cm, "54cm": c.soil_temperature_54cm },
            soil_moisture: { "0-1cm": c.soil_moisture_0_to_1cm, "1-3cm": c.soil_moisture_1_to_3cm, "3-9cm": c.soil_moisture_3_to_9cm, "9-27cm": c.soil_moisture_9_to_27cm, "27-81cm": c.soil_moisture_27_to_81cm },
          },
          farming_advice: getFarmingAdvice(c.soil_temperature_0cm, c.soil_moisture_0_to_1cm),
          source: "open-meteo.com",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};

function getFarmingAdvice(temp?: number, moisture?: number): string {
  if (temp === undefined || moisture === undefined) return "بيانات غير كافية";
  if (temp < 5) return "تربة باردة جداً — تأخر الزراعة";
  if (temp > 35) return "تربة حارة جداً — تجنب الزراعة";
  if (moisture < 0.1) return "تربة جافة — يحتاج ري";
  if (moisture > 0.4) return "تربة رطبة جداً — تجنب الري";
  return "ظروف جيدة للزراعة";
}
