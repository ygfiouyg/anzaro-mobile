/**
 * MCP Tool: Holidays Info
 * تكامل حقيقي مع Nager.Date API (مجاني تماماً، بدون API key).
 * بيرجّع الأعياد الرسمية لأي دولة في أي سنة.
 */
import type { MCPTool } from "../types";

export const holidaysInfoTool: MCPTool = {
  name: "holidays_info",
  description: "الأعياد الرسمية لأي دولة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'أعياد' أو 'عطلة' أو 'holidays'.",
  parameters: {
    type: "object",
    properties: {
      countryCode: { type: "string", description: "كود الدولة (مثلاً: EG, US, SA, AE)" },
      year: { type: "number", description: "السنة (افتراضي: السنة الحالية)" },
    },
    required: ["countryCode"],
  },
  async execute(params) {
    const countryCode = String(params.countryCode || "").toUpperCase().trim();
    const year = Number(params.year) || new Date().getFullYear();

    if (!countryCode) return { success: false, error: "countryCode مطلوب" };
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return { success: false, error: "countryCode لازم حرفين (مثلاً: EG, US, SA)" };
    }

    try {
      const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `مفيش بيانات أعياد لـ "${countryCode}" في ${year}` };
      }
      if (!res.ok) {
        return { success: false, error: `Nager.Date API error ${res.status}` };
      }

      const data: any[] = await res.json();
      if (!Array.isArray(data)) {
        return { success: false, error: "استجابة غير متوقعة من الـ API" };
      }

      const holidays = data.map((h: any) => ({
        date: h.date || "",
        local_name: h.localName || "",
        english_name: h.name || "",
        country_code: h.countryCode || countryCode,
        fixed: h.fixed || false,
        global: h.global || false,
        counties: h.counties || null,
        types: h.types || [],
        launch_year: h.launchYear || null,
      }));

      // ترتيب حسب التاريخ
      holidays.sort((a, b) => a.date.localeCompare(b.date));

      return {
        success: true,
        data: {
          country_code: countryCode,
          year,
          total: holidays.length,
          holidays,
          source: "date.nager.at",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
