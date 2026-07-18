/**
 * MCP Tool: Country Info
 * تكامل حقيقي مع REST Countries API (مجاني تماماً، بدون API key).
 * بيرجّع معلومات تفصيلية عن أي دولة.
 */
import type { MCPTool } from "../types";

export const countryInfoTool: MCPTool = {
  name: "country_info",
  description: "معلومات تفصيلية عن أي دولة (API حقيقي). استخدمها لما المستخدم يقول 'دولة' أو 'country' أو 'معلومات بلد'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "اسم الدولة أو الكود (مثلاً: Egypt, EG, مصر)" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      // خرائط الأسماء العربية/الإنجليزية لأكواد ISO
      const countryMap: Record<string, string> = {
        مصر: "Egypt",
        السعودية: "Saudi Arabia",
        الإمارات: "United Arab Emirates",
        الكويت: "Kuwait",
        قطر: "Qatar",
        البحرين: "Bahrain",
        عمان: "Oman",
        الأردن: "Jordan",
        لبنان: "Lebanon",
        سوريا: "Syria",
        العراق: "Iraq",
        المغرب: "Morocco",
        الجزائر: "Algeria",
        تونس: "Tunisia",
        ليبيا: "Libya",
        السودان: "Sudan",
        اليمن: "Yemen",
        فلسطين: "Palestine",
        تركيا: "Turkey",
        إيران: "Iran",
      };

      const searchTerm = countryMap[query] || query;

      // جرّب بالاسم الأول، لو فشل جرّب بالـ code
      let url: string;
      if (/^[a-zA-Z]{2,3}$/.test(searchTerm)) {
        // لو code (2-3 حروف)
        url = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(searchTerm.toLowerCase())}`;
      } else {
        url = `https://restcountries.com/v3.1/name/${encodeURIComponent(searchTerm)}?fullText=false`;
      }

      // استخدم world-countries JSON من CDN (بديل REST Countries deprecated)
      const res = await fetch("https://cdn.jsdelivr.net/npm/world-countries@5.0.0/countries.json", {
        headers: { "User-Agent": "DeltaAI-MCP/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { success: false, error: `Countries data fetch error ${res.status}` };
      }

      const allCountries: any[] = await res.json();
      if (!Array.isArray(allCountries) || allCountries.length === 0) {
        return { success: false, error: "مفيش بيانات دول متاحة" };
      }

      // ابحث عن الدولة (بالاسم أو الكود)
      const searchLower = searchTerm.toLowerCase();
      let c = allCountries.find(
        (country) =>
          country.name?.common?.toLowerCase() === searchLower ||
          country.name?.official?.toLowerCase() === searchLower ||
          country.cca2?.toLowerCase() === searchLower ||
          country.cca3?.toLowerCase() === searchLower ||
          Object.values(country.name?.native || {}).some(
            (n: any) => n.common?.toLowerCase() === searchLower || n.official?.toLowerCase() === searchLower
          )
      );

      // لو مش موجود بالظبط، دور بـ contains
      if (!c) {
        c = allCountries.find(
          (country) =>
            country.name?.common?.toLowerCase().includes(searchLower) ||
            country.name?.official?.toLowerCase().includes(searchLower)
        );
      }

      if (!c) {
        return {
          success: false,
          error: `الدولة "${query}" مش موجودة. جرّب الاسم بالإنجليزي أو كود ISO.`,
        };
      }

      const currencies = c.currencies || {};
      const languages = c.languages || {};
      const currencyList = Object.keys(currencies).map((code) => ({
        code,
        name: (currencies as any)[code]?.name || "",
        symbol: (currencies as any)[code]?.symbol || "",
      }));
      const languageList = Object.keys(languages).map((code) => ({
        code,
        name: (languages as any)[code],
      }));

      return {
        success: true,
        data: {
          name: c.name?.common || c.name?.official || "",
          official_name: c.name?.official || "",
          cca2: c.cca2 || "",
          cca3: c.cca3 || "",
          capital: Array.isArray(c.capital) ? c.capital[0] : c.capital || "",
          region: c.region || "",
          subregion: c.subregion || "",
          population: c.population || 0,
          area_km2: c.area || 0,
          flag: c.flag || "",
          flag_url: c.flags?.png || c.flags?.svg || null,
          currencies: currencyList,
          languages: languageList,
          calling_codes: (c.idd?.root || "") + ((c.idd?.suffixes || []).join("") || ""),
          timezones: c.timezones || [],
          borders: c.borders || [],
          maps: c.maps?.googleMaps || null,
          independent: c.independent,
          un_member: c.unMember,
          start_of_week: c.startOfWeek || "",
          driving_side: c.car?.side || "",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
