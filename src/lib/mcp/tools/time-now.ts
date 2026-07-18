/**
 * MCP Tool: Time/Timezone
 * تكامل حقيقي مع WorldTime API (مجاني تماماً، بدون API key).
 * بيرجّع الوقت الحالي لأي منطقة زمنية.
 */
import type { MCPTool } from "../types";

export const timeNowTool: MCPTool = {
  name: "time_now",
  description: "الوقت والتاريخ الحالي لأي منطقة زمنية (API حقيقي). استخدمها لما المستخدم يقول 'الوقت' أو 'time' أو 'ساعة'.",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "المنطقة الزمنية (مثلاً: Africa/Cairo, America/New_York, Asia/Dubai). افتراضي: Africa/Cairo",
        default: "Africa/Cairo",
      },
    },
    required: [],
  },
  async execute(params) {
    let timezone = String(params.timezone || "Africa/Cairo").trim();
    if (!timezone) timezone = "Africa/Cairo";

    // قائمة بالـ timezones الشائعة (خرائط اختصارات)
    const tzMap: Record<string, string> = {
      cairo: "Africa/Cairo",
      egypt: "Africa/Cairo",
      مصر: "Africa/Cairo",
      dubai: "Asia/Dubai",
      uae: "Asia/Dubai",
      riyadh: "Asia/Riyadh",
      saudi: "Asia/Riyadh",
      السعودية: "Asia/Riyadh",
      london: "Europe/London",
      uk: "Europe/London",
      paris: "Europe/Paris",
      berlin: "Europe/Berlin",
      moscow: "Europe/Moscow",
      newyork: "America/New_York",
      ny: "America/New_York",
      usa: "America/New_York",
      losangeles: "America/Los_Angeles",
      chicago: "America/Chicago",
      tokyo: "Asia/Tokyo",
      japan: "Asia/Tokyo",
      اليابان: "Asia/Tokyo",
      hongkong: "Asia/Hong_Kong",
      singapore: "Asia/Singapore",
      sydney: "Australia/Sydney",
      mumbai: "Asia/Kolkata",
      india: "Asia/Kolkata",
      الهند: "Asia/Kolkata",
    };

    const tz = tzMap[timezone.toLowerCase()] || timezone;

    try {
      const url = `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(tz)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        // fallback: WorldTime API
        const url2 = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
        const res2 = await fetch(url2, {
          headers: { "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res2.ok) {
          return { success: false, error: `Time API error: ${res2.status}. تأكد إن الـ timezone صحيح: ${tz}` };
        }
        const data2: any = await res2.json();
        const datetime = data2.datetime || "";
        return {
          success: true,
          data: {
            timezone: tz,
            datetime,
            date: datetime.split("T")[0] || "",
            time: datetime.split("T")[1]?.split(".")[0] || "",
            day_of_week: data2.day_of_week || "",
            week_number: data2.week_number || null,
            utc_offset: data2.utc_offset || "",
            source: "worldtimeapi.org",
          },
        };
      }

      const data: any = await res.json();
      return {
        success: true,
        data: {
          timezone: tz,
          datetime: data.dateTime || "",
          date: data.date || "",
          time: data.time || "",
          day_of_week: data.dayOfWeek || "",
          has_dst: data.hasDst || false,
          source: "timeapi.io",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
