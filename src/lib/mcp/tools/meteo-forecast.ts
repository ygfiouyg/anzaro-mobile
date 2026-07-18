/**
 * MCP Tool: Weather Forecast (7 days)
 * تكامل حقيقي مع Open-Meteo API (مجاني تماماً، بدون API key).
 * بيرجّع توقعات الطقس لـ 7 أيام + hourly.
 */
import type { MCPTool } from "../types";

export const meteoForecastTool: MCPTool = {
  name: "meteo_forecast",
  description: "توقعات الطقس لـ 7 أيام (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'توقعات' أو 'forecast' أو 'الجو بكرة'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      city: { type: "string", description: "اسم المدينة (بديل عن lat/lng)" },
      days: { type: "number", description: "عدد الأيام (افتراضي: 7، أقصى: 16)", default: 7 },
    },
    required: [],
  },
  async execute(params) {
    let lat = Number(params.lat);
    let lng = Number(params.lng);
    const city = String(params.city || "").trim();
    const days = Math.min(16, Math.max(1, Number(params.days) || 7));

    try {
      // لو فيه city، نحولها لـ إحداثيات
      if (city && (isNaN(lat) || isNaN(lng))) {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ar&format=json`,
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
        } else {
          return { success: false, error: "فشل geocoding" };
        }
      }

      if (isNaN(lat) || isNaN(lng)) {
        return { success: false, error: "lat/lng أو city مطلوبين" };
      }

      // توقعات الطقس
      const params2 = new URLSearchParams();
      params2.set("latitude", String(lat));
      params2.set("longitude", String(lng));
      params2.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_max,uv_index_max,sunrise,sunset,precipitation_probability_max");
      params2.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m");
      params2.set("timezone", "auto");
      params2.set("forecast_days", String(days));

      const url = `https://api.open-meteo.com/v1/forecast?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `Open-Meteo API error ${res.status}` };
      }

      const data: any = await res.json();
      const daily = data.daily || {};
      const current = data.current || {};

      const dailyForecast: any[] = [];
      const dates = daily.time || [];
      for (let i = 0; i < dates.length; i++) {
        dailyForecast.push({
          date: dates[i],
          weather: weatherCodeToText(daily.weather_code?.[i]),
          weather_code: daily.weather_code?.[i],
          temp_max: daily.temperature_2m_max?.[i],
          temp_min: daily.temperature_2m_min?.[i],
          precipitation: daily.precipitation_sum?.[i] || 0,
          precipitation_probability: daily.precipitation_probability_max?.[i] || 0,
          wind_speed_max: daily.wind_speed_max?.[i] || 0,
          uv_index: daily.uv_index_max?.[i] || 0,
          sunrise: daily.sunrise?.[i] || "",
          sunset: daily.sunset?.[i] || "",
        });
      }

      return {
        success: true,
        data: {
          location: { lat, lng },
          timezone: data.timezone || "UTC",
          current: {
            temperature: current.temperature_2m,
            apparent_temp: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            weather: weatherCodeToText(current.weather_code),
            weather_code: current.weather_code,
            wind_speed: current.wind_speed_10m,
            wind_direction: current.wind_direction_10m,
            time: current.time,
          },
          daily_forecast: dailyForecast,
          days: dailyForecast.length,
          source: "open-meteo.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function weatherCodeToText(code?: number): string {
  if (code === undefined || code === null) return "غير معروف";
  const map: Record<number, string> = {
    0: "صافي",
    1: "صافي معليش",
    2: "غائم جزئياً",
    3: "غائم",
    45: "ضباب",
    48: "ضباب متجمد",
    51: "رذاذ خفيف",
    53: "رذاذ متوسط",
    55: "رذاذ كثيف",
    56: "رذاذ متجمد خفيف",
    57: "رذاذ متجمد كثيف",
    61: "مطر خفيف",
    63: "مطر متوسط",
    65: "مطر كثيف",
    66: "مطر متجمد خفيف",
    67: "مطر متجمد كثيف",
    71: "ثلج خفيف",
    73: "ثلج متوسط",
    75: "ثلج كثيف",
    77: "حبيبات ثلج",
    80: "زخات مطر خفيفة",
    81: "زخات مطر متوسطة",
    82: "زخات مطر كثيفة",
    85: "زخات ثلج خفيفة",
    86: "زخات ثلج كثيفة",
    95: "عاصفة رعدية",
    96: "عاصفة رعدية مع برد خفيف",
    99: "عاصفة رعدية مع برد كثيف",
  };
  return map[code] || "غير معروف";
}
