/**
 * MCP Tool: Sun Info
 * تكامل حقيقي مع Sunrise-Sunset API (مجاني تماماً، بدون API key).
 * بيرجّع أوقات شروق/غروب + طول النهار لأي إحداثيات.
 */
import type { MCPTool } from "../types";

export const sunInfoTool: MCPTool = {
  name: "sun_info",
  description: "أوقات شروق/غروب الشمس لأي مكان (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'شروق' أو 'غروب' أو 'sunrise' أو 'sunset'.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "خط العرض (latitude)" },
      lng: { type: "number", description: "خط الطول (longitude)" },
      date: { type: "string", description: "التاريخ بصيغة YYYY-MM-DD (افتراضي: اليوم)" },
    },
    required: ["lat", "lng"],
  },
  async execute(params) {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    const date = String(params.date || "today").trim();

    if (isNaN(lat) || isNaN(lng)) {
      return { success: false, error: "lat و lng مطلوبين (أرقام)" };
    }
    if (lat < -90 || lat > 90) {
      return { success: false, error: "lat لازم بين -90 و 90" };
    }
    if (lng < -180 || lng > 180) {
      return { success: false, error: "lng لازم بين -180 و 180" };
    }

    try {
      const params2 = new URLSearchParams();
      params2.set("lat", String(lat));
      params2.set("lng", String(lng));
      params2.set("formatted", "0");
      if (date && date !== "today") {
        params2.set("date", date);
      }

      const url = `https://api.sunrise-sunset.org/json?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `Sunrise-Sunset API error ${res.status}` };
      }

      const data: any = await res.json();

      if (data.status !== "OK") {
        return { success: false, error: `API status: ${data.status}` };
      }

      const results = data.results || {};

      // حساب طول النهار
      let dayLengthSeconds = 0;
      if (results.day_length) {
        dayLengthSeconds = typeof results.day_length === "number" ? results.day_length : 0;
      } else if (results.sunrise && results.sunset) {
        const sr = new Date(results.sunrise).getTime();
        const ss = new Date(results.sunset).getTime();
        dayLengthSeconds = Math.round((ss - sr) / 1000);
      }

      const hours = Math.floor(dayLengthSeconds / 3600);
      const minutes = Math.floor((dayLengthSeconds % 3600) / 60);
      const seconds = dayLengthSeconds % 60;

      return {
        success: true,
        data: {
          location: { lat, lng },
          date: date === "today" ? new Date().toISOString().split("T")[0] : date,
          sunrise: results.sunrise || "",
          sunset: results.sunset || "",
          solar_noon: results.solar_noon || "",
          day_length: `${hours}h ${minutes}m ${seconds}s`,
          day_length_seconds: dayLengthSeconds,
          civil_twilight_begin: results.civil_twilight_begin || "",
          civil_twilight_end: results.civil_twilight_end || "",
          nautical_twilight_begin: results.nautical_twilight_begin || "",
          nautical_twilight_end: results.nautical_twilight_end || "",
          astronomical_twilight_begin: results.astronomical_twilight_begin || "",
          astronomical_twilight_end: results.astronomical_twilight_end || "",
          timezone: results.timezone || "UTC",
          source: "sunrise-sunset.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
