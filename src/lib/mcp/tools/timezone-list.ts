/**
 * MCP Tool: Timezone List
 * تكامل حقيقي مع WorldTimeAPI — قائمة كل الـ timezones.
 */
import type { MCPTool } from "../types";

export const timezoneListTool: MCPTool = {
  name: "timezone_list",
  description: "قائمة كل الـ timezones + الوقت الحالي (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'timezones' أو 'مناطق زمنية'.",
  parameters: {
    type: "object",
    properties: {
      area: { type: "string", description: "فلترة بالـ area (Africa, America, Asia, Europe...)" },
      sample: { type: "boolean", description: "اجيب وقت حالي لعينة (افتراضي: true)", default: true },
      sampleCount: { type: "number", description: "عدد العينات للوقت الحالي (افتراضي: 5)", default: 5 },
    },
    required: [],
  },
  async execute(params) {
    const area = String(params.area || "").trim();
    const sample = params.sample !== false;
    const sampleCount = Math.min(20, Math.max(1, Number(params.sampleCount) || 5));

    try {
      const url = "https://worldtimeapi.org/api/timezone";
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `WorldTimeAPI error ${res.status}` };

      const data: any = await res.json();
      let timezones: string[] = Array.isArray(data) ? data : [];

      // filter by area
      if (area) {
        const areaLower = area.toLowerCase();
        timezones = timezones.filter((tz) => tz.toLowerCase().startsWith(areaLower + "/"));
      }

      const total = timezones.length;

      // group by area
      const areas: Record<string, number> = {};
      timezones.forEach((tz) => {
        const a = tz.split("/")[0];
        areas[a] = (areas[a] || 0) + 1;
      });

      // sample current times
      let samples: any[] = [];
      if (sample && timezones.length > 0) {
        const sampleTzs: string[] = [];
        const step = Math.max(1, Math.floor(timezones.length / sampleCount));
        for (let i = 0; i < timezones.length && sampleTzs.length < sampleCount; i += step) {
          sampleTzs.push(timezones[i]);
        }

        samples = await Promise.all(
          sampleTzs.map(async (tz) => {
            try {
              const r = await fetch(`https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(5000),
              });
              if (r.ok) {
                const d: any = await r.json();
                return {
                  timezone: tz,
                  datetime: d.datetime || "",
                  utc_offset: d.utc_offset || "",
                  day_of_week: d.day_of_week || "",
                  week_number: d.week_number || null,
                };
              }
            } catch {}
            return { timezone: tz, datetime: null, error: "failed" };
          })
        );
      }

      return {
        success: true,
        data: {
          area: area || null,
          total_timezones: total,
          areas_breakdown: Object.entries(areas)
            .sort((a, b) => b[1] - a[1])
            .map(([a, count]) => ({ area: a, count })),
          timezones: timezones.slice(0, 200), // limit display
          samples,
          source: "worldtimeapi.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
