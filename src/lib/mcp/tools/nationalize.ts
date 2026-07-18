/**
 * MCP Tool: Nationalize
 * تكامل حقيقي مع Nationalize API (مجاني، 1000/يوم بدون key).
 * بي تنبأ بالجنسية من الاسم.
 */
import type { MCPTool } from "../types";

export const nationalizeTool: MCPTool = {
  name: "nationalize",
  description: "تنبأ بجنسية أي اسم (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'nationality' أو 'جنسية اسم'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "الاسم الأول" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5)", default: 5 },
    },
    required: ["name"],
  },
  async execute(params) {
    const name = String(params.name || "").trim();
    const count = Math.min(20, Math.max(1, Number(params.count) || 5));
    if (!name) return { success: false, error: "name مطلوب" };

    try {
      const apiKey = process.env.NATIONALIZE_API_KEY || "";
      const params2 = new URLSearchParams({ name });
      if (apiKey) params2.set("apikey", apiKey);

      const res = await fetch(`https://api.nationalize.io?${params2.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Nationalize API error ${res.status}` };

      const data: any = await res.json();

      const countries = (data.country || []).slice(0, count).map((c: any) => ({
        country_code: c.country_id || "",
        country_name: getCountryName(c.country_id || ""),
        probability: Math.round((c.probability || 0) * 10000) / 100,
      }));

      return {
        success: true,
        data: {
          name: data.name,
          found: countries.length > 0,
          top_country: countries[0] || null,
          countries,
          source: "nationalize.io",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function getCountryName(code: string): string {
  const names: Record<string, string> = {
    EG: "مصر", SA: "السعودية", AE: "الإمارات", US: "أمريكا", GB: "بريطانيا",
    DE: "ألمانيا", FR: "فرنسا", IT: "إيطاليا", ES: "إسبانيا", TR: "تركيا",
    IN: "الهند", CN: "الصين", JP: "اليابان", KR: "كوريا", RU: "روسيا",
    BR: "البرازيل", MX: "المكسيك", CA: "كندا", AU: "أستراليا", NL: "هولندا",
    BE: "بلجيكا", CH: "سويسرا", AT: "النمسا", SE: "السويد", NO: "النرويج",
    DK: "الدنمارك", FI: "فنلندا", PL: "بولندا", PT: "البرتغال", GR: "اليونان",
    IE: "أيرلندا", CZ: "التشيك", RO: "رومانيا", HU: "المجر", BG: "بلغاريا",
    JO: "الأردن", LB: "لبنان", SY: "سوريا", IQ: "العراق", IR: "إيران",
    MA: "المغرب", DZ: "الجزائر", TN: "تونس", LY: "ليبيا", SD: "السودان",
    YE: "اليمن", KW: "الكويت", QA: "قطر", BH: "البحرين", OM: "عمان",
  };
  return names[code] || code;
}
