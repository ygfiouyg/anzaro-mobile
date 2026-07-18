/**
 * MCP Tool: REST Country Languages
 * تكامل حقيقي مع REST Countries API — دول تستخدم لغة معينة.
 */
import type { MCPTool } from "../types";

export const restCountryLanguagesTool: MCPTool = {
  name: "rest_country_languages",
  description: "دول تستخدم لغة معينة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'لغة' أو 'languages' أو 'دول عربية'.",
  parameters: {
    type: "object",
    properties: {
      language: { type: "string", description: "كود اللغة (مثلاً: ara, eng, fra)" },
    },
    required: ["language"],
  },
  async execute(params) {
    const language = String(params.language || "").toLowerCase().trim();
    if (!language) return { success: false, error: "language مطلوب" };
    try {
      const res = await fetch(`https://restcountries.com/v3.1/lang/${language}?fields=name,cca2,cca3,flag,languages,maps,region`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: `اللغة "${language}" مش موجودة` };
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any[] = await res.json();
      const countries = data.map((c: any) => ({ name: c.name?.common || "", code: c.cca2 || "", flag: c.flag || "", region: c.region || "", languages: Object.values(c.languages || {}), map: c.maps?.googleMaps || "" }));
      const regions: Record<string, number> = {};
      countries.forEach(c => { regions[c.region] = (regions[c.region] || 0) + 1; });
      return { success: true, data: { language_code: language, total_countries: countries.length, by_region: regions, countries: countries.sort((a, b) => a.name.localeCompare(b.name)), source: "restcountries.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
