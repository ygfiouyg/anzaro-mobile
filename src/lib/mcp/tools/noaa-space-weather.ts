/**
 * MCP Tool: NOAA Space Weather
 * تكامل حقيقي مع NOAA SWPC API (مجاني، بدون API key).
 * بيرجّع حالة الطقس الفضائي + الشمس.
 */
import type { MCPTool } from "../types";

export const noaaSpaceWeatherTool: MCPTool = {
  name: "noaa_space_weather",
  description: "حالة الطقس الفضائي + الشمس (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'space weather' أو 'طقس فضائي' أو 'شمس'.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      // fetch multiple NOAA endpoints in parallel
      const [solarRes, geoRes, auroraRes] = await Promise.all([
        fetch("https://services.swpc.noaa.gov/json/solar/solar_flare_1d.json", {
          headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(15000),
        }),
        fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", {
          headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(15000),
        }),
        fetch("https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-north.txt", {
          headers: { Accept: "text/plain", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      const result: any = {
        source: "swpc.noaa.gov",
      };

      // solar flares
      if (solarRes.ok) {
        const solarData: any[] = await solarRes.json();
        const recentFlares = solarData.slice(-10).map((f: any) => ({
          time: f.time_tag || "",
          class: f.class || "",
          location: f.location || "",
          region: f.region || "",
        }));
        const xClass = recentFlares.filter((f) => f.class?.startsWith("X"));
        const mClass = recentFlares.filter((f) => f.class?.startsWith("M"));
        result.solar_flares = {
          recent: recentFlares,
          x_class_count: xClass.length,
          m_class_count: mClass.length,
          strongest: [...recentFlares].sort((a, b) => (b.class || "").localeCompare(a.class || ""))[0] || null,
        };
      }

      // geomagnetic activity (K-index)
      if (geoRes.ok) {
        const geoData: any[] = await geoRes.json();
        const recent = geoData.slice(-24);
        const kIndices = recent.map((g: any) => g.kp || 0);
        const currentK = kIndices[kIndices.length - 1] || 0;
        const maxK = Math.max(...kIndices, 0);

        result.geomagnetic = {
          current_kp: currentK,
          current_level: getKpLevel(currentK),
          max_kp_24h: maxK,
          max_level_24h: getKpLevel(maxK),
          recent_24h: recent.map((g: any) => ({
            time: g.time_tag || "",
            kp: g.kp || 0,
          })),
        };
      }

      // aurora forecast (north hemisphere)
      if (auroraRes.ok) {
        const auroraText = await auroraRes.text();
        const lines = auroraText.split("\n").filter((l) => l && !l.startsWith("#"));
        result.aurora = {
          forecast_available: lines.length > 0,
          note: "Aurora visibility forecast for northern hemisphere",
          raw_lines: lines.slice(0, 5),
        };
      }

      // overall space weather summary
      const currentKp = result.geomagnetic?.current_kp || 0;
      result.summary = {
        space_weather_level: getKpLevel(currentKp),
        solar_activity: result.solar_flares?.x_class_count > 0 ? "عالية" : result.solar_flares?.m_class_count > 0 ? "متوسطة" : "منخفضة",
        geomagnetic_activity: getKpLevel(currentKp),
        aurora_visibility: currentKp >= 5 ? "محتملة في خطوط عرض عالية" : currentKp >= 4 ? "محتملة في القطبين" : "غير محتملة",
      };

      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function getKpLevel(kp: number): string {
  if (kp < 2) return "هادئ";
  if (kp < 4) return "غير مستقر";
  if (kp < 5) return "نشط";
  if (kp < 6) return "عاصفة صغيرة";
  if (kp < 7) return "عاصفة";
  if (kp < 8) return "عاصفة قوية";
  if (kp < 9) return "عاصفة شديدة";
  return "عاصفة extreme";
}
