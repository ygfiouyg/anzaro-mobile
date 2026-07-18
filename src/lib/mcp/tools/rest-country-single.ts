/**
 * MCP Tool: REST Country Single
 * تكامل حقيقي مع REST Countries API — تفاصيل دولة واحدة.
 */
import type { MCPTool } from "../types";

export const restCountrySingleTool: MCPTool = {
  name: "rest_country_single",
  description: "تفاصيل دولة واحدة بالاسم أو الكود (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'معلومات دولة' أو 'country details'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "اسم الدولة أو الكود (مثلاً: egypt, eg, egy)" },
      by: { type: "string", description: "name, alpha (code), callingcode (افتراضي: name)", default: "name" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const by = String(params.by || "name").toLowerCase();

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      let url: string;
      if (by === "alpha") {
        url = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(query)}?fields=name,cca2,cca3,capital,region,subregion,population,area,languages,currencies,flag,flags,idd,timezones,borders,latlng,maps,startOfWeek,car,coatOfArms,demonyms,gini`;
      } else if (by === "callingcode") {
        url = `https://restcountries.com/v3.1/callingcode/${encodeURIComponent(query)}?fields=name,cca2,cca3,capital,region,subregion,population,area,languages,currencies,flag,flags,idd,timezones,borders,latlng,maps`;
      } else {
        url = `https://restcountries.com/v3.1/name/${encodeURIComponent(query)}?fields=name,cca2,cca3,capital,region,subregion,population,area,languages,currencies,flag,flags,idd,timezones,borders,latlng,maps,startOfWeek,car,coatOfArms,demonyms,gini`;
      }

      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الدولة "${query}" مش موجودة` };
      if (!res.ok) return { success: false, error: `REST Countries API error ${res.status}` };

      const data: any[] = await res.json();
      const c = data[0] || data;

      const currencies = Object.entries(c.currencies || {}).map(([code, val]: any) => ({
        code,
        name: val.name || "",
        symbol: val.symbol || "",
      }));

      const languages = Object.entries(c.languages || {}).map(([code, name]) => ({
        code,
        name,
      }));

      return {
        success: true,
        data: {
          name: c.name?.common || "",
          official_name: c.name?.official || "",
          native_names: c.name?.nativeName ? Object.entries(c.name.nativeName).map(([lang, n]: any) => ({
            language: lang,
            official: n.official || "",
            common: n.common || "",
          })) : [],
          cca2: c.cca2 || "",
          cca3: c.cca3 || "",
          capital: Array.isArray(c.capital) ? c.capital : (c.capital ? [c.capital] : []),
          region: c.region || "",
          subregion: c.subregion || "",
          population: c.population || 0,
          area_km2: c.area || 0,
          density: c.area > 0 ? Math.round((c.population / c.area) * 10) / 10 : 0,
          languages,
          currencies,
          flag_emoji: c.flag || "",
          flag_url: c.flags?.png || c.flags?.svg || "",
          calling_code: c.idd?.root ? c.idd.root + (c.idd.suffixes?.[0] || "") : "",
          timezones: c.timezones || [],
          borders: c.borders || [],
          coordinates: c.latlng || [0, 0],
          maps: c.maps?.googleMaps || "",
          start_of_week: c.startOfWeek || "",
          driving_side: c.car?.side || "",
          car_signs: c.car?.signs || [],
          coat_of_arms: c.coatOfArms?.png || c.coatOfArms?.svg || null,
          demonym: c.demonyms?.eng?.m || "",
          gini: c.gini ? Object.entries(c.gini).map(([year, val]) => ({ year, value: val })) : [],
          source: "restcountries.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
