/**
 * MCP Tool: REST Countries List
 * تكامل حقيقي مع REST Countries API — قائمة كل الدول + فلترة.
 */
import type { MCPTool } from "../types";

export const restCountriesAllTool: MCPTool = {
  name: "rest_countries_all",
  description: "قائمة كل الدول + فلترة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'كل الدول' أو 'countries list'.",
  parameters: {
    type: "object",
    properties: {
      region: { type: "string", description: "Africa, Americas, Asia, Europe, Oceania (اختياري)" },
      currency: { type: "string", description: "كود عملة (اختياري، مثلاً: usd, egp)" },
      language: { type: "string", description: "كود لغة (اختياري، مثلاً: ara, eng)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 0 = الكل)", default: 0 },
    },
    required: [],
  },
  async execute(params) {
    const region = String(params.region || "").trim();
    const currency = String(params.currency || "").toLowerCase().trim();
    const language = String(params.language || "").toLowerCase().trim();
    const count = Number(params.count) || 0;

    try {
      let url = "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,capital,region,subregion,population,area,languages,currencies,flag,flags,callingCodes,timezones,borders,latlng,maps";

      if (region) {
        url = `https://restcountries.com/v3.1/region/${encodeURIComponent(region)}?fields=name,cca2,cca3,capital,region,subregion,population,area,languages,currencies,flag,flags,callingCodes,timezones,borders,latlng,maps`;
      } else if (currency) {
        url = `https://restcountries.com/v3.1/currency/${encodeURIComponent(currency)}?fields=name,cca2,cca3,capital,region,subregion,population,area,languages,currencies,flag,flags,callingCodes,timezones,borders,latlng,maps`;
      } else if (language) {
        url = `https://restcountries.com/v3.1/lang/${encodeURIComponent(language)}?fields=name,cca2,cca3,capital,region,subregion,population,area,languages,currencies,flag,flags,callingCodes,timezones,borders,latlng,maps`;
      }

      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `REST Countries API error ${res.status}` };

      const data: any[] = await res.json();
      let countries = data.map((c: any) => ({
        name: c.name?.common || "",
        official_name: c.name?.official || "",
        cca2: c.cca2 || "",
        cca3: c.cca3 || "",
        capital: Array.isArray(c.capital) ? c.capital[0] : c.capital || "",
        region: c.region || "",
        subregion: c.subregion || "",
        population: c.population || 0,
        area_km2: c.area || 0,
        languages: Object.values(c.languages || {}),
        currencies: Object.keys(c.currencies || {}).map((code) => ({
          code,
          name: c.currencies[code]?.name || "",
          symbol: c.currencies[code]?.symbol || "",
        })),
        flag: c.flag || "",
        flag_url: c.flags?.png || c.flags?.svg || "",
        calling_codes: (c.idd?.root ? [c.idd.root] : []).concat(c.idd?.suffixes || []),
        timezones: c.timezones || [],
        borders: c.borders || [],
        coordinates: c.latlng || [0, 0],
        maps: c.maps?.openStreetMaps || null,
      }));

      if (count > 0) {
        countries = countries.slice(0, count);
      }

      // stats
      const totalPopulation = countries.reduce((s, c) => s + c.population, 0);
      const totalArea = countries.reduce((s, c) => s + c.area_km2, 0);

      return {
        success: true,
        data: {
          filter: {
            region: region || null,
            currency: currency || null,
            language: language || null,
          },
          total_countries: countries.length,
          total_population: totalPopulation,
          total_area_km2: totalArea,
          countries,
          source: "restcountries.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
