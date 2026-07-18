/**
 * MCP Tool: Open-Meteo Marine
 * تكامل حقيقي مع Open-Meteo Marine API (مجاني، بدون API key).
 * بيرجّع حالة البحر لأي موقع ساحلي.
 */
import type { MCPTool } from "../types";

export const openMeteoMarineTool: MCPTool = {
  name: "open_meteo_marine",
  description: "حالة البحر لأي موقع (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'marine' أو 'بحر' أو 'أمواج'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      city: { type: "string", description: "اسم المدينة الساحلية" },
      days: { type: "number", description: "عدد الأيام (افتراضي: 3، أقصى: 7)", default: 3 },
    },
    required: [],
  },
  async execute(params) {
    let lat = Number(params.lat);
    let lng = Number(params.lng);
    const city = String(params.city || "").trim();
    const days = Math.min(7, Math.max(1, Number(params.days) || 3));

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
        current: "wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period",
        daily: "wave_height_max,wave_direction_dominant,wind_wave_height_max,swell_wave_height_max",
        forecast_days: String(days),
        timezone: "auto",
      });

      const url = `https://marine-api.open-meteo.com/v1/marine?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Marine API error ${res.status}` };

      const data: any = await res.json();
      const current = data.current || {};
      const daily = data.daily || {};

      const dailyForecast: any[] = [];
      const dates = daily.time || [];
      for (let i = 0; i < dates.length; i++) {
        dailyForecast.push({
          date: dates[i],
          wave_height_max: daily.wave_height_max?.[i] || 0,
          wave_direction: daily.wave_direction_dominant?.[i] || 0,
          wind_wave_max: daily.wind_wave_height_max?.[i] || 0,
          swell_wave_max: daily.swell_wave_height_max?.[i] || 0,
        });
      }

      return {
        success: true,
        data: {
          location: { lat, lng, city: city || null },
          timezone: data.timezone || "auto",
          current: {
            time: current.time,
            wave_height: current.wave_height,
            wave_direction: current.wave_direction,
            wave_direction_compass: degreesToCompass(current.wave_direction),
            wave_period: current.wave_period,
            wind_wave_height: current.wind_wave_height,
            wind_wave_direction: current.wind_wave_direction,
            wind_wave_period: current.wind_wave_period,
            swell_wave_height: current.swell_wave_height,
            swell_wave_direction: current.swell_wave_direction,
            swell_wave_period: current.swell_wave_period,
          },
          units: data.current_units || {},
          daily_forecast: dailyForecast,
          days: dailyForecast.length,
          sea_state: getSeaState(current.wave_height || 0),
          source: "marine-api.open-meteo.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function degreesToCompass(deg?: number): string {
  if (deg === undefined) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function getSeaState(waveHeight: number): string {
  if (waveHeight < 0.1) return "هادئ (مرآة)";
  if (waveHeight < 0.5) return "هادئ (تموجات)";
  if (waveHeight < 1.25) return "سلس (أمواج صغيرة)";
  if (waveHeight < 2.5) return "معتدل";
  if (waveHeight < 4) return "خشن";
  if (waveHeight < 6) return "خشن جداً";
  if (waveHeight < 9) return "عالي";
  if (waveHeight < 14) return "عالي جداً";
  return "هائل";
}
