/**
 * MCP Tool: REST Country Capital
 * تكامل حقيقي مع REST Countries API — عاصمة أي دولة + معلوماتها.
 */
import type { MCPTool } from "../types";

export const restCountryCapitalTool: MCPTool = {
  name: "rest_country_capital",
  description: "عاصمة أي دولة + معلوماتها (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'عاصمة' أو 'capital'.",
  parameters: {
    type: "object",
    properties: {
      capital: { type: "string", description: "اسم العاصمة (مثلاً: Cairo, Tokyo, Paris)" },
    },
    required: ["capital"],
  },
  async execute(params) {
    const capital = String(params.capital || "").trim();
    if (!capital) return { success: false, error: "capital مطلوب" };
    try {
      const res = await fetch(`https://restcountries.com/v3.1/capital/${encodeURIComponent(capital)}?fields=name,cca2,cca3,capital,population,region,subregion,area,flag,flags,latlng,maps,timezones,currencies,languages`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: `العاصمة "${capital}" مش موجودة` };
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any[] = await res.json();
      const countries = data.map((c: any) => ({ country: c.name?.common || "", country_code: c.cca2 || "", capitals: c.capital || [], population: c.population || 0, region: c.region || "", subregion: c.subregion || "", area_km2: c.area || 0, flag: c.flag || "", flag_url: c.flags?.png || "", coordinates: c.latlng || [0, 0], map: c.maps?.googleMaps || "", timezones: c.timezones || [], currencies: Object.keys(c.currencies || {}), languages: Object.values(c.languages || {}) }));
      return { success: true, data: { query: capital, total_countries: countries.length, countries, source: "restcountries.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
