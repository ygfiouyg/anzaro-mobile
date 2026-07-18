/**
 * MCP Tool: Earthquake Info
 * تكامل حقيقي مع USGS Earthquake API (مجاني تماماً، بدون API key).
 * بيرجّع الزلازل الأخيرة حول العالم.
 */
import type { MCPTool } from "../types";

export const earthquakeInfoTool: MCPTool = {
  name: "earthquake_info",
  description: "الزلازل الأخيرة حول العالم (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'زلزال' أو 'earthquake' أو 'هزة أرضية'.",
  parameters: {
    type: "object",
    properties: {
      minMagnitude: { type: "number", description: "أقل قوة (افتراضي: 2.5)", default: 2.5 },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
      timeframe: {
        type: "string",
        description: "hour, day, week, month (افتراضي: day)",
        default: "day",
      },
      region: { type: "string", description: "فلترة بالمنطقة (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const minMag = Math.min(10, Math.max(0, Number(params.minMagnitude) || 2.5));
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const timeframe = String(params.timeframe || "day").toLowerCase();
    const region = String(params.region || "").trim();

    const timeframes: Record<string, number> = {
      hour: 3600000,
      day: 86400000,
      week: 604800000,
      month: 2592000000,
    };
    const timeMs = timeframes[timeframe] || timeframes.day;
    const startTime = new Date(Date.now() - timeMs).toISOString();

    try {
      const params2 = new URLSearchParams();
      params2.set("format", "geojson");
      params2.set("starttime", startTime);
      params2.set("minmagnitude", String(minMag));
      params2.set("limit", String(count));
      params2.set("orderby", "time");

      const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `USGS API error ${res.status}` };

      const data: any = await res.json();
      const features: any[] = data.features || [];

      let earthquakes = features.map((f: any) => {
        const p = f.properties || {};
        const g = f.geometry || {};
        return {
          id: f.id,
          magnitude: p.mag || 0,
          magnitude_type: p.magType || "",
          place: p.place || "",
          time: p.time ? new Date(p.time).toISOString() : "",
          tz_offset: p.tz || 0,
          url: p.url || "",
          detail_url: p.detail || "",
          felt: p.felt || 0,
          cdi: p.cdi || null,
          mmi: p.mmi || null,
          alert: p.alert || null,
          status: p.status || "",
          tsunami: p.tsunami || 0,
          sig: p.sig || 0,
          types: p.types ? p.types.split(",").slice(0, 10) : [],
          coordinates: {
            longitude: g.coordinates?.[0] || 0,
            latitude: g.coordinates?.[1] || 0,
            depth_km: g.coordinates?.[2] || 0,
          },
        };
      });

      // filter by region if specified
      if (region) {
        const lowerRegion = region.toLowerCase();
        earthquakes = earthquakes.filter((e) => e.place.toLowerCase().includes(lowerRegion));
      }

      const magnitudes = earthquakes.map((e) => e.magnitude);
      const stats = {
        total: earthquakes.length,
        max_magnitude: magnitudes.length > 0 ? Math.max(...magnitudes) : 0,
        min_magnitude: magnitudes.length > 0 ? Math.min(...magnitudes) : 0,
        avg_magnitude: magnitudes.length > 0 ? Math.round((magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length) * 10) / 10 : 0,
        tsunamis: earthquakes.filter((e) => e.tsunami).length,
        felt_reports: earthquakes.filter((e) => e.felt > 0).length,
      };

      return {
        success: true,
        data: {
          timeframe,
          min_magnitude: minMag,
          start_time: startTime,
          stats,
          earthquakes,
          source: "earthquake.usgs.gov",
          generated: data.metadata?.generated || "",
          api_count: data.metadata?.count || 0,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
