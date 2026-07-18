/**
 * MCP Tool: NASA Mars Weather
 * تكامل حقيقي مع NASA InSight API — طقس المريخ.
 */
import type { MCPTool } from "../types";

export const marsWeatherTool: MCPTool = {
  name: "mars_weather",
  description: "طقس المريخ من NASA InSight (API حقيقي). استخدمها لما المستخدم يقول 'mars weather' أو 'طقس المريخ'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد الأيام (افتراضي: 5، أقصى: 7)", default: 5 },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(7, Math.max(1, Number(params.count) || 5));

    try {
      const apiKey = process.env.NASA_API_KEY || "DEMO_KEY";
      const url = `https://api.nasa.gov/insight_weather/?api_key=${apiKey}&feedtype=json&ver=1.0`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `NASA API error ${res.status}` };

      const data: any = await res.json();

      const solKeys: string[] = data.sol_keys || [];
      if (solKeys.length === 0) {
        return {
          success: true,
          data: {
            available: false,
            message: "بيانات طقس المريخ مش متاحة دلوقتي (InSight mission انتهت)",
            source: "api.nasa.gov",
          },
        };
      }

      const days = solKeys.slice(0, count).map((sol: string) => {
        const d = data[sol] || {};
        return {
          sol: parseInt(sol),
          first_utc: d.First_UTC || "",
          last_utc: d.Last_UTC || "",
          season: d.Season || "",
          temperature: {
            avg: d.AT?.av ?? null,
            min: d.AT?.mn ?? null,
            max: d.AT?.mx ?? null,
            samples: d.AT?.ct || 0,
            unit: "°C",
          },
          wind_speed: {
            avg: d.HWS?.av ?? null,
            min: d.HWS?.mn ?? null,
            max: d.HWS?.mx ?? null,
            samples: d.HWS?.ct || 0,
            unit: "m/s",
          },
          pressure: {
            avg: d.PRE?.av ?? null,
            min: d.PRE?.mn ?? null,
            max: d.PRE?.mx ?? null,
            samples: d.PRE?.ct || 0,
            unit: "Pa",
          },
          wind_direction: d.WD
            ? Object.values(d.WD)
                .filter((w: any) => w?.ct > 0)
                .sort((a: any, b: any) => b.ct - a.ct)
                .slice(0, 3)
                .map((w: any) => ({
                  compass: w?.compass_point || "",
                  count: w?.ct || 0,
                  degrees: w?.compass_degrees || 0,
                }))
            : [],
        };
      });

      const validity_checks = data.validity_checks || {};

      return {
        success: true,
        data: {
          available: true,
          sol_count: days.length,
          days,
          season: days[0]?.season || "",
          average_temp: days[0]?.temperature.avg,
          average_wind: days[0]?.wind_speed.avg,
          average_pressure: days[0]?.pressure.avg,
          validity_checks: Object.keys(validity_checks).length > 0
            ? Object.fromEntries(
                Object.entries(validity_checks).slice(0, 3).map(([k, v]: any) => [
                  k,
                  { valid: v?.VALID ?? false },
                ])
              )
            : null,
          source: "api.nasa.gov (InSight lander)",
          note: "InSight mission انتهت، البيانات دي تاريخية",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
