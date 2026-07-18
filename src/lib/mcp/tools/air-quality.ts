/**
 * MCP Tool: Air Quality
 * تكامل حقيقي مع Open-Meteo Air Quality API (مجاني تماماً، بدون API key).
 * بيرجّع جودة الهواء لأي موقع.
 */
import type { MCPTool } from "../types";

export const airQualityTool: MCPTool = {
  name: "air_quality",
  description: "جودة الهواء لأي مدينة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'air quality' أو 'تلوث' أو 'جودة الهواء'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      city: { type: "string", description: "اسم المدينة (بديل عن lat/lng)" },
    },
    required: [],
  },
  async execute(params) {
    let lat = Number(params.lat);
    let lng = Number(params.lng);
    const city = String(params.city || "").trim();

    try {
      // geocode if city provided
      if (city && (isNaN(lat) || isNaN(lng))) {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (geoRes.ok) {
          const geoData: any = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            lat = geoData.results[0].latitude;
            lng = geoData.results[0].longitude;
          } else {
            return { success: false, error: `المدينة "${city}" مش موجودة` };
          }
        }
      }

      if (isNaN(lat) || isNaN(lng)) {
        return { success: false, error: "lat/lng أو city مطلوبين" };
      }

      const params2 = new URLSearchParams();
      params2.set("latitude", String(lat));
      params2.set("longitude", String(lng));
      params2.set("current", "european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,aerosol_optical_thickness,dust,uv_index,ammonia");
      params2.set("timezone", "auto");

      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Air Quality API error ${res.status}` };

      const data: any = await res.json();
      const current = data.current || {};

      const aqiLevel = (aqi: number, system: "european" | "us"): string => {
        if (system === "european") {
          if (aqi <= 20) return "ممتازة";
          if (aqi <= 40) return "جيدة";
          if (aqi <= 60) return "مقبولة";
          if (aqi <= 80) return "سيئة";
          if (aqi <= 100) return "سيئة جداً";
          return "خطيرة";
        } else {
          if (aqi <= 50) return "جيدة";
          if (aqi <= 100) return "مقبولة";
          if (aqi <= 150) return "غير صحية للمجموعات الحساسة";
          if (aqi <= 200) return "غير صحية";
          if (aqi <= 300) return "سيئة جداً";
          return "خطيرة";
        }
      };

      const europeanAqi = current.european_aqi || 0;
      const usAqi = current.us_aqi || 0;

      return {
        success: true,
        data: {
          location: { lat, lng, city: city || null },
          timezone: data.timezone || "auto",
          current: {
            time: current.time,
            european_aqi: europeanAqi,
            european_aqi_level: aqiLevel(europeanAqi, "european"),
            us_aqi: usAqi,
            us_aqi_level: aqiLevel(usAqi, "us"),
            pollutants: {
              pm10: current.pm10 ? `${current.pm10} µg/m³` : null,
              pm2_5: current.pm2_5 ? `${current.pm2_5} µg/m³` : null,
              carbon_monoxide: current.carbon_monoxide ? `${current.carbon_monoxide} µg/m³` : null,
              nitrogen_dioxide: current.nitrogen_dioxide ? `${current.nitrogen_dioxide} µg/m³` : null,
              sulphur_dioxide: current.sulphur_dioxide ? `${current.sulphur_dioxide} µg/m³` : null,
              ozone: current.ozone ? `${current.ozone} µg/m³` : null,
              ammonia: current.ammonia ? `${current.ammonia} µg/m³` : null,
            },
            aerosol_optical_thickness: current.aerosol_optical_thickness || null,
            dust: current.dust ? `${current.dust} µg/m³` : null,
            uv_index: current.uv_index || null,
          },
          health_advice: getHealthAdvice(usAqi),
          source: "air-quality-api.open-meteo.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function getHealthAdvice(aqi: number): string {
  if (aqi <= 50) return "الهواء نظيف. آمن للأنشطة الخارجية.";
  if (aqi <= 100) return "مقبول. حساسية لبعض الأشخاص.";
  if (aqi <= 150) return "تجنّب الأنشطة الخارجية المطولة للمجموعات الحساسة.";
  if (aqi <= 200) return "غير صحي. قلّل الأنشطة الخارجية.";
  if (aqi <= 300) return "سيئ جداً. تجنّب الخروج.";
  return "خطير. ابقَ بالداخل وأغلق النوافذ.";
}
