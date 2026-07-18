/**
 * MCP Tool: REST Country Region
 * تكامل حقيقي مع REST Countries API — كل دول منطقة معينة.
 */
import type { MCPTool } from "../types";

export const restCountryRegionTool: MCPTool = {
  name: "rest_country_region",
  description: "كل دول منطقة معينة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'region' أو 'دول أفريقيا' أو 'dollar أمريكا'.",
  parameters: {
    type: "object",
    properties: {
      region: { type: "string", description: "المنطقة: Africa, Americas, Asia, Europe, Oceania" },
      fields: { type: "string", description: "حقول إضافية (اختياري)" },
    },
    required: ["region"],
  },
  async execute(params) {
    const region = String(params.region || "").trim();
    if (!region) return { success: false, error: "region مطلوب" };
    try {
      const res = await fetch(`https://restcountries.com/v3.1/region/${encodeURIComponent(region)}?fields=name,cca2,cca3,capital,population,area,flag,languages,currencies,subregion,latlng,maps,timezones`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: `المنطقة "${region}" مش موجودة` };
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any[] = await res.json();
      const countries = data.map((c: any) => ({ name: c.name?.common || "", code: c.cca2 || "", capital: c.capital?.[0] || "", population: c.population || 0, area_km2: c.area || 0, density: c.area > 0 ? Math.round((c.population / c.area) * 10) / 10 : 0, flag: c.flag || "", subregion: c.subregion || "", languages: Object.values(c.languages || {}), currencies: Object.keys(c.currencies || {}), coordinates: c.latlng || [0, 0], map: c.maps?.googleMaps || "", timezones: c.timezones || [] })).sort((a, b) => b.population - a.population);
      const totalPopulation = countries.reduce((s, c) => s + c.population, 0);
      const totalArea = countries.reduce((s, c) => s + c.area_km2, 0);
      const subregions: Record<string, number> = {};
      countries.forEach(c => { if (c.subregion) subregions[c.subregion] = (subregions[c.subregion] || 0) + 1; });
      return { success: true, data: { region, total_countries: countries.length, total_population: totalPopulation, total_area_km2: totalArea, subregions, countries, largest_by_population: countries[0] || null, smallest_by_population: countries[countries.length - 1] || null, source: "restcountries.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
