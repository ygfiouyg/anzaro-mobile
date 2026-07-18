/**
 * MCP Tool: Astronomy Events
 * تكامل حقيقي مع NASA APOD API + meteor shower data.
 * بيرجّع حدث فلكي اليوم + meteor showers.
 *
 * محتاج NASA_API_KEY env var (مجاني من api.nasa.gov).
 */
import type { MCPTool } from "../types";

export const astronomyEventsTool: MCPTool = {
  name: "astronomy_events",
  description: "أحداث فلكية + صورة اليوم من NASA (API حقيقي). استخدمها لما المستخدم يقول 'فلك' أو 'astronomy' أو 'NASA'.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "تاريخ بصيغة YYYY-MM-DD (افتراضي: اليوم)" },
      type: {
        type: "string",
        description: "apod (صورة اليوم) أو meteors (زخات الشهب)",
        default: "apod",
      },
    },
    required: [],
  },
  async execute(params) {
    const date = String(params.date || "").trim();
    const type = String(params.type || "apod").toLowerCase();

    try {
      if (type === "meteors") {
        return getMeteorShowers();
      }

      // APOD - Astronomy Picture of the Day
      const apiKey = process.env.NASA_API_KEY || "DEMO_KEY";
      const params2 = new URLSearchParams();
      params2.set("api_key", apiKey);
      if (date) params2.set("date", date);

      const url = `https://api.nasa.gov/planetary/apod?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { success: false, error: `NASA API error ${res.status}` };
      }

      const data: any = await res.json();

      return {
        success: true,
        data: {
          type: "apod",
          date: data.date || "",
          title: data.title || "",
          explanation: data.explanation || "",
          media_type: data.media_type || "image",
          url: data.url || "",
          hdurl: data.hdurl || null,
          copyright: data.copyright || "Public Domain",
          service_version: data.service_version || "v1",
          source: "api.nasa.gov",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function getMeteorShowers() {
  // قائمة بيانات الزخات الشهية (تقريبية)
  const showers = [
    { name: "Quadrantids", peak: "January 3-4", zenithal_hourly_rate: 60, radiant: "Boötes", active: "Dec 26 - Jan 12" },
    { name: "Lyrids", peak: "April 22-23", zenithal_hourly_rate: 18, radiant: "Lyra", active: "Apr 16 - Apr 25" },
    { name: "Eta Aquariids", peak: "May 5-6", zenithal_hourly_rate: 50, radiant: "Aquarius", active: "Apr 19 - May 28" },
    { name: "Delta Aquariids", peak: "July 29-30", zenithal_hourly_rate: 20, radiant: "Aquarius", active: "Jul 12 - Aug 23" },
    { name: "Perseids", peak: "August 12-13", zenithal_hourly_rate: 100, radiant: "Perseus", active: "Jul 17 - Aug 24" },
    { name: "Draconids", peak: "October 8-9", zenithal_hourly_rate: 10, radiant: "Draco", active: "Oct 6 - Oct 10" },
    { name: "Orionids", peak: "October 21-22", zenithal_hourly_rate: 20, radiant: "Orion", active: "Oct 2 - Nov 7" },
    { name: "Taurids", peak: "November 5-12", zenithal_hourly_rate: 5, radiant: "Taurus", active: "Sep 7 - Dec 10" },
    { name: "Leonids", peak: "November 17-18", zenithal_hourly_rate: 15, radiant: "Leo", active: "Nov 6 - Nov 30" },
    { name: "Geminids", peak: "December 13-14", zenithal_hourly_rate: 120, radiant: "Gemini", active: "Dec 4 - Dec 20" },
    { name: "Ursids", peak: "December 21-22", zenithal_hourly_rate: 10, radiant: "Ursa Minor", active: "Dec 17 - Dec 26" },
  ];

  const now = new Date();
  const month = now.getMonth() + 1;

  // find active now
  const active = showers.filter((s) => {
    // simple month-based check
    const months: Record<string, number[]> = {
      "Quadrantids": [12, 1],
      "Lyrids": [4],
      "Eta Aquariids": [4, 5],
      "Delta Aquariids": [7, 8],
      "Perseids": [7, 8],
      "Draconids": [10],
      "Orionids": [10],
      "Taurids": [9, 10, 11, 12],
      "Leonids": [11],
      "Geminids": [12],
      "Ursids": [12],
    };
    return months[s.name]?.includes(month);
  });

  return {
    success: true,
    data: {
      type: "meteors",
      current_month: now.toLocaleString("en-US", { month: "long" }),
      active_now: active,
      all_showers: showers,
      next_major: showers.find((s) => s.zenithal_hourly_rate >= 50) || null,
      source: "International Meteor Organization",
    },
  };
}
