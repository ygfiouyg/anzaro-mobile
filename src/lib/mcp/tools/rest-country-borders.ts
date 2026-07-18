/**
 * MCP Tool: REST Country Borders
 * تكامل حقيقي مع REST Countries API — borders لأي دولة.
 */
import type { MCPTool } from "../types";

export const restCountryBordersTool: MCPTool = {
  name: "rest_country_borders",
  description: "دول الجوار لأي دولة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'borders' أو 'دول مجاورة'.",
  parameters: {
    type: "object",
    properties: {
      countryCode: { type: "string", description: "كود الدولة (مثلاً: EGY, USA, SAU)" },
    },
    required: ["countryCode"],
  },
  async execute(params) {
    const code = String(params.countryCode || "").toUpperCase().trim();
    if (!code) return { success: false, error: "countryCode مطلوب" };
    try {
      const res = await fetch(`https://restcountries.com/v3.1/alpha/${code}?fields=name,borders,maps`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: `الدولة "${code}" مش موجودة` };
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const borders = data.borders || [];
      if (borders.length === 0) return { success: true, data: { country: code, borders: [], message: "مفيش دول مجاورة (جزيرة أو معزولة)" } };
      const borderRes = await fetch(`https://restcountries.com/v3.1/alpha?codes=${borders.join(",")}&fields=name,cca2,cca3,flag,maps`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      const borderData: any[] = borderRes.ok ? await borderRes.json() : [];
      const borderCountries = borderData.map((c: any) => ({ code: c.cca2 || "", name: c.name?.common || "", flag: c.flag || "", map: c.maps?.googleMaps || "" }));
      return { success: true, data: { country: code, country_name: data.name?.common || "", total_borders: borderCountries.length, borders: borderCountries, source: "restcountries.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
