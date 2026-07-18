/**
 * MCP Tool — Weather
 * ==================
 * الحصول على حالة الجو لمدينة معينة عبر Open-Meteo API (مجاني 100% بدون key).
 * لو الـ geocoding فشل، بنطبّق fallback لمدن كبرى معروفة الإحداثيات.
 */
import type { MCPTool } from "../types";

const CITY_FALLBACK: Record<string, { lat: number; lon: number; name: string; country: string }> = {
  cairo: { lat: 30.0444, lon: 31.2357, name: "Cairo", country: "Egypt" },
  "القاهرة": { lat: 30.0444, lon: 31.2357, name: "Cairo", country: "Egypt" },
  riyadh: { lat: 24.7136, lon: 46.6753, name: "Riyadh", country: "Saudi Arabia" },
  "الرياض": { lat: 24.7136, lon: 46.6753, name: "Riyadh", country: "Saudi Arabia" },
  dubai: { lat: 25.2048, lon: 55.2708, name: "Dubai", country: "UAE" },
  "دبي": { lat: 25.2048, lon: 55.2708, name: "Dubai", country: "UAE" },
  london: { lat: 51.5074, lon: -0.1278, name: "London", country: "UK" },
  paris: { lat: 48.8566, lon: 2.3522, name: "Paris", country: "France" },
  "new york": { lat: 40.7128, lon: -74.006, name: "New York", country: "USA" },
  tokyo: { lat: 35.6762, lon: 139.6503, name: "Tokyo", country: "Japan" },
  istanbul: { lat: 41.0082, lon: 28.9784, name: "Istanbul", country: "Turkey" },
  "إسطنبول": { lat: 41.0082, lon: 28.9784, name: "Istanbul", country: "Turkey" },
  amman: { lat: 31.9454, lon: 35.9284, name: "Amman", country: "Jordan" },
  "عمان": { lat: 31.9454, lon: 35.9284, name: "Amman", country: "Jordan" },
  beirut: { lat: 33.8938, lon: 35.5018, name: "Beirut", country: "Lebanon" },
  "بيروت": { lat: 33.8938, lon: 35.5018, name: "Beirut", country: "Lebanon" },
};

const WMO_CODES: Record<number, { label: string; ar: string }> = {
  0: { label: "Clear sky", ar: "سماء صافية" },
  1: { label: "Mainly clear", ar: "صافٍ غالبًا" },
  2: { label: "Partly cloudy", ar: "غائم جزئيًا" },
  3: { label: "Overcast", ar: "غائم كليًا" },
  45: { label: "Fog", ar: "ضباب" },
  48: { label: "Depositing rime fog", ar: "ضباب جليدي" },
  51: { label: "Light drizzle", ar: "رذاذ خفيف" },
  53: { label: "Moderate drizzle", ar: "رذاذ متوسط" },
  55: { label: "Dense drizzle", ar: "رذاذ كثيف" },
  61: { label: "Slight rain", ar: "مطر خفيف" },
  63: { label: "Moderate rain", ar: "مطر متوسط" },
  65: { label: "Heavy rain", ar: "مطر غزير" },
  71: { label: "Slight snow", ar: "ثلج خفيف" },
  73: { label: "Moderate snow", ar: "ثلج متوسط" },
  75: { label: "Heavy snow", ar: "ثلج كثيف" },
  80: { label: "Rain showers", ar: "زخات مطر" },
  81: { label: "Heavy rain showers", ar: "زخات مطر غزيرة" },
  82: { label: "Violent rain showers", ar: "زخات مطر عنيفة" },
  95: { label: "Thunderstorm", ar: "عاصفة رعدية" },
  96: { label: "Thunderstorm + hail", ar: "عاصفة رعدية مع برَد" },
  99: { label: "Severe thunderstorm + hail", ar: "عاصفة شديدة مع برَد" },
};

export const weatherGetTool: MCPTool = {
  name: "weather_get",
  description:
    "Get the current weather for any city using the free Open-Meteo API (no API key required). Returns temperature, apparent temperature, humidity, wind speed, and weather condition. City name can be in English or Arabic.",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "City name (e.g. 'Cairo', 'الرياض', 'London').",
      },
      country: {
        type: "string",
        description: "Optional country name to disambiguate (e.g. 'Egypt').",
      },
      units: {
        type: "string",
        description: "Temperature unit.",
        enum: ["celsius", "fahrenheit"],
        default: "celsius",
      },
    },
    required: ["city"],
  },
  async execute(params) {
    const cityRaw = String(params.city || "").trim();
    const country = params.country ? String(params.country).trim() : "";
    const units = (String(params.units || "celsius").toLowerCase().trim()) as "celsius" | "fahrenheit";

    if (!cityRaw) {
      return { success: false, error: "city مطلوبة" };
    }

    const cityLower = cityRaw.toLowerCase();

    try {
      let lat: number;
      let lon: number;
      let resolvedName = cityRaw;
      let resolvedCountry = country;

      // 1) جرّب fallback للمدن الكبرى الأول
      const fallback = CITY_FALLBACK[cityLower];
      if (fallback) {
        lat = fallback.lat;
        lon = fallback.lon;
        resolvedName = fallback.name;
        resolvedCountry = fallback.country;
      } else {
        // 2) Geocoding عبر Open-Meteo
        const params2 = new URLSearchParams({
          name: cityRaw,
          count: "1",
          language: "en",
          format: "json",
        });
        if (country) params2.set("country", country);

        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?${params2.toString()}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        const geoData = await geoRes.json();

        const first = geoData?.results?.[0];
        if (!first) {
          return {
            success: false,
            error: `مش قادر ألاقي إحداثيات المدينة: ${cityRaw}. جرّب اسم بالإنجليزي أو مدينة أكبر.`,
          };
        }
        lat = first.latitude;
        lon = first.longitude;
        resolvedName = first.name || cityRaw;
        resolvedCountry = first.country || country;
      }

      // 3) نجيب الجو الحالي
      const tempUnit = units === "fahrenheit" ? "fahrenheit" : "celsius";
      const windUnit = units === "fahrenheit" ? "mph" : "kmh";
      const weatherParams = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: [
          "temperature_2m",
          "relative_humidity_2m",
          "apparent_temperature",
          "is_day",
          "weather_code",
          "wind_speed_10m",
          "wind_direction_10m",
          "pressure_msl",
        ].join(","),
        temperature_unit: tempUnit,
        wind_speed_unit: windUnit,
        timezone: "auto",
      });

      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      const wxData = await wxRes.json();
      const cur = wxData?.current;
      if (!cur) {
        return { success: false, error: "فشل الحصول على بيانات الجو من Open-Meteo" };
      }

      const wmo = WMO_CODES[cur.weather_code] || {
        label: `Code ${cur.weather_code}`,
        ar: `كود ${cur.weather_code}`,
      };

      return {
        success: true,
        data: {
          city: resolvedName,
          country: resolvedCountry,
          latitude: lat,
          longitude: lon,
          timezone: wxData.timezone || "",
          units: { temperature: tempUnit, wind: windUnit },
          current: {
            temperature: cur.temperature_2m,
            apparentTemperature: cur.apparent_temperature,
            humidity: cur.relative_humidity_2m,
            windSpeed: cur.wind_speed_10m,
            windDirection: cur.wind_direction_10m,
            pressure: cur.pressure_msl,
            isDay: cur.is_day === 1,
            weatherCode: cur.weather_code,
            condition: wmo.label,
            conditionAr: wmo.ar,
          },
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (e: any) {
      return { success: false, error: `Weather fetch error: ${e.message}` };
    }
  },
};
