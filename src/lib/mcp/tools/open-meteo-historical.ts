/**
 * MCP Tool: Open-Meteo Historical Weather
 * تكامل حقيقي مع Open-Meteo Archive API (مجاني، بدون API key).
 * بيرجّع طقس تاريخي لأي تاريخ.
 */
import type { MCPTool } from "../types";

export const openMeteoHistoricalTool: MCPTool = {
  name: "open_meteo_historical",
  description: "طقس تاريخي لأي تاريخ (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'طقس تاريخي' أو 'historical weather'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      city: { type: "string", description: "اسم المدينة" },
      startDate: { type: "string", description: "تاريخ البداية YYYY-MM-DD" },
      endDate: { type: "string", description: "تاريخ النهاية YYYY-MM-DD (افتراضي: نفس البداية)" },
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
        start_date: startDate,
        end_date: endDate,
        daily: "weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,snowfall_sum,wind_speed_max,wind_gusts_max,wind_direction_dominant",
        timezone: "auto",
      });

      const url = `https://archive-api.open-meteo.com/v1/archive?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `Open-Meteo Archive API error ${res.status}` };

      const data: any = await res.json();
      const daily = data.daily || {};

      const days: any[] = [];
      const dates = daily.time || [];
      for (let i = 0; i < dates.length; i++) {
        days.push({
          date: dates[i],
          weather_code: daily.weather_code?.[i],
          temp_max: daily.temperature_2m_max?.[i],
          temp_min: daily.temperature_2m_min?.[i],
          temp_mean: daily.temperature_2m_mean?.[i],
          precipitation: daily.precipitation_sum?.[i] || 0,
          rain: daily.rain_sum?.[i] || 0,
          snowfall: daily.snowfall_sum?.[i] || 0,
          wind_max: daily.wind_speed_max?.[i] || 0,
          wind_gusts: daily.wind_gusts_max?.[i] || 0,
          wind_direction: daily.wind_direction_dominant?.[i] || 0,
        });
      }

      // calculate averages
      const avgMax = days.length > 0 ? days.reduce((s, d) => s + (d.temp_max || 0), 0) / days.length : 0;
      const avgMin = days.length > 0 ? days.reduce((s, d) => s + (d.temp_min || 0), 0) / days.length : 0;
      const totalPrecip = days.reduce((s, d) => s + (d.precipitation || 0), 0);

      return {
        success: true,
        data: {
          location: { lat, lng, city: city || null },
          timezone: data.timezone || "auto",
          start_date: startDate,
          end_date: endDate,
          days_count: days.length,
          summary: {
            avg_max_temp: Math.round(avgMax * 10) / 10,
            avg_min_temp: Math.round(avgMin * 10) / 10,
            total_precipitation: Math.round(totalPrecip * 10) / 10,
          },
          daily: days,
          source: "archive-api.open-meteo.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
