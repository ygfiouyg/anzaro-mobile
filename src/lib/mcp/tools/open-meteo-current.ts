/**
 * MCP Tool: Open-Meteo Current Weather (detailed)
 * تكامل حقيقي مع Open-Meteo API — طقس حالي تفصيلي.
 */
import type { MCPTool } from "../types";

export const openMeteoCurrentTool: MCPTool = {
  name: "open_meteo_current",
  description: "طقس حالي تفصيلي لمدينة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'current weather detailed' أو 'طقس تفصيلي'.",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "اسم المدينة" },
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
    },
    required: [],
  },
  async execute(params) {
    let lat = Number(params.lat);
    let lng = Number(params.lng);
    const city = String(params.city || "").trim();

    try {
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
          }
        }
      }

      if (isNaN(lat) || isNaN(lng)) {
        return { success: false, error: "lat/lng أو city مطلوبين" };
      }

      const params2 = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        timezone: "auto",
      });

      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params2.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Open-Meteo API error ${res.status}` };

      const data: any = await res.json();
      const current = data.current || {};

      return {
        success: true,
        data: {
          location: { lat, lng, city: city || null },
          timezone: data.timezone || "auto",
          current: {
            time: current.time,
            temperature: current.temperature_2m,
            apparent_temperature: current.apparent_temperature,
            is_day: current.is_day === 1,
            humidity: current.relative_humidity_2m,
            precipitation: current.precipitation,
            rain: current.rain,
            showers: current.showers,
            snowfall: current.snowfall,
            weather_code: current.weather_code,
            weather_description: weatherCodeToText(current.weather_code),
            cloud_cover: current.cloud_cover,
            pressure_msl: current.pressure_msl,
            surface_pressure: current.surface_pressure,
            wind_speed: current.wind_speed_10m,
            wind_direction: current.wind_direction_10m,
            wind_direction_compass: degreesToCompass(current.wind_direction_10m),
            wind_gusts: current.wind_gusts_10m,
          },
          units: data.current_units || {},
          source: "open-meteo.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function weatherCodeToText(code?: number): string {
  if (code === undefined) return "";
  const map: Record<number, string> = {
    0: "صافي", 1: "صافي معليش", 2: "غائم جزئياً", 3: "غائم",
    45: "ضباب", 48: "ضباب متجمد",
    51: "رذاذ خفيف", 53: "رذاذ متوسط", 55: "رذاذ كثيف",
    61: "مطر خفيف", 63: "مطر متوسط", 65: "مطر كثيف",
    71: "ثلج خفيف", 73: "ثلج متوسط", 75: "ثلج كثيف",
    80: "زخات مطر", 81: "زخات مطر متوسطة", 82: "زخات مطر كثيفة",
    95: "عاصفة رعدية", 96: "عاصفة رعدية مع برد", 99: "عاصفة رعدية شديدة",
  };
  return map[code] || "غير معروف";
}

function degreesToCompass(deg?: number): string {
  if (deg === undefined) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
