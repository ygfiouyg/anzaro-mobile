/**
 * MCP Tool: Weather Alerts
 * تكامل حقيقي مع Open-Meteo API — تحذيرات الطقس + severe weather.
 * بيرجّع درجة الحرارة + سرعة الرياح + احتمال مطر لمدينة.
 */
import type { MCPTool } from "../types";

export const weatherAlertsTool: MCPTool = {
  name: "weather_alerts",
  description: "تحذيرات الطقس لمدينة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'weather alert' أو 'تحذير طقس'.",
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
          } else {
            return { success: false, error: `المدينة "${city}" مش موجودة` };
          }
        }
      }

      if (isNaN(lat) || isNaN(lng)) {
        return { success: false, error: "lat/lng أو city مطلوبين" };
      }

      // forecast + alerts
      const params2 = new URLSearchParams();
      params2.set("latitude", String(lat));
      params2.set("longitude", String(lng));
      params2.set("current", "temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,uv_index,relative_humidity_2m");
      params2.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_max,wind_gusts_max,uv_index_max,precipitation_probability_max");
      params2.set("forecast_days", "3");
      params2.set("timezone", "auto");

      const url = `https://api.open-meteo.com/v1/forecast?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Open-Meteo API error ${res.status}` };

      const data: any = await res.json();
      const current = data.current || {};
      const daily = data.daily || {};

      // generate alerts
      const alerts: any[] = [];

      // heat alert
      if (current.apparent_temperature >= 40) {
        alerts.push({
          type: "heat",
          severity: "severe",
          message: `حرارة شديدة (${current.apparent_temperature}°C) — تجنّب الشمس`,
        });
      } else if (current.apparent_temperature >= 35) {
        alerts.push({
          type: "heat",
          severity: "moderate",
          message: `حرارة عالية (${current.apparent_temperature}°C)`,
        });
      }

      // cold alert
      if (current.apparent_temperature <= -10) {
        alerts.push({
          type: "cold",
          severity: "severe",
          message: `برودة شديدة (${current.apparent_temperature}°C)`,
        });
      } else if (current.apparent_temperature <= 0) {
        alerts.push({
          type: "cold",
          severity: "moderate",
          message: `برودة (${current.apparent_temperature}°C)`,
        });
      }

      // wind alert
      const windGusts = current.wind_gusts_10m || 0;
      if (windGusts >= 75) {
        alerts.push({
          type: "wind",
          severity: "severe",
          message: `رياح عاصفة (${windGusts} km/h)`,
        });
      } else if (windGusts >= 50) {
        alerts.push({
          type: "wind",
          severity: "moderate",
          message: `رياح قوية (${windGusts} km/h)`,
        });
      }

      // rain alert
      const precipitation = current.precipitation || 0;
      if (precipitation >= 10) {
        alerts.push({
          type: "rain",
          severity: "severe",
          message: `أمطار غزيرة (${precipitation}mm)`,
        });
      } else if (precipitation >= 3) {
        alerts.push({
          type: "rain",
          severity: "moderate",
          message: `أمطار (${precipitation}mm)`,
        });
      }

      // UV alert
      const uvIndex = current.uv_index || 0;
      if (uvIndex >= 8) {
        alerts.push({
          type: "uv",
          severity: "severe",
          message: `أشعة شمس قوية (UV ${uvIndex}) — استخدم واقي شمس`,
        });
      } else if (uvIndex >= 6) {
        alerts.push({
          type: "uv",
          severity: "moderate",
          message: `أشعة شمس عالية (UV ${uvIndex})`,
        });
      }

      // daily forecast
      const forecast: any[] = [];
      const dates = daily.time || [];
      for (let i = 0; i < dates.length; i++) {
        forecast.push({
          date: dates[i],
          temp_max: daily.temperature_2m_max?.[i],
          temp_min: daily.temperature_2m_min?.[i],
          precipitation: daily.precipitation_sum?.[i] || 0,
          precipitation_probability: daily.precipitation_probability_max?.[i] || 0,
          wind_max: daily.wind_speed_max?.[i] || 0,
          gusts_max: daily.wind_gusts_max?.[i] || 0,
          uv_max: daily.uv_index_max?.[i] || 0,
        });
      }

      return {
        success: true,
        data: {
          location: { lat, lng, city: city || null },
          timezone: data.timezone || "auto",
          current: {
            temperature: current.temperature_2m,
            apparent_temp: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            precipitation: current.precipitation,
            wind_speed: current.wind_speed_10m,
            wind_gusts: current.wind_gusts_10m,
            uv_index: current.uv_index,
            weather_code: current.weather_code,
          },
          alerts,
          alerts_count: alerts.length,
          severe_alerts: alerts.filter((a) => a.severity === "severe").length,
          forecast,
          source: "open-meteo.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
