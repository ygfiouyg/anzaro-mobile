/**
 * MCP Tool: ZIP Code Lookup
 * تكامل حقيقي مع Zippopotam.us API (مجاني تماماً، بدون API key).
 * بيرجّع معلومات أي zipcode أمريكي/دولي.
 */
import type { MCPTool } from "../types";

export const zipLookupTool: MCPTool = {
  name: "zip_lookup",
  description: "معلومات أي zipcode (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'zipcode' أو 'رمز بريدي' أو 'postal code'.",
  parameters: {
    type: "object",
    properties: {
      zip: { type: "string", description: "الـ zipcode (مثلاً: 90210)" },
      country: { type: "string", description: "كود الدولة (افتراضي: US). مثلاً: US, DE, FR, GB" },
    },
    required: ["zip"],
  },
  async execute(params) {
    const zip = String(params.zip || "").trim();
    const country = String(params.country || "US").toUpperCase().trim();

    if (!zip) return { success: false, error: "zip مطلوب" };
    if (!/^[A-Z]{2}$/.test(country)) {
      return { success: false, error: "country لازم حرفين (مثلاً: US, DE)" };
    }

    try {
      const url = `https://api.zippopotam.us/${country}/${encodeURIComponent(zip)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `الـ zipcode "${zip}" مش موجود في ${country}` };
      }
      if (!res.ok) {
        return { success: false, error: `Zippopotam API error ${res.status}` };
      }

      const data: any = await res.json();

      const places = (data.places || []).map((p: any) => ({
        name: p["place name"] || p.name || "",
        longitude: parseFloat(p.longitude) || null,
        latitude: parseFloat(p.latitude) || null,
        state: p.state || "",
        state_abbreviation: p["state abbreviation"] || "",
        county: p["county"] || null,
      }));

      return {
        success: true,
        data: {
          zip,
          country: data.country || country,
          country_abbreviation: data["country abbreviation"] || country,
          places,
          places_count: places.length,
          primary_place: places[0] || null,
          source: "zippopotam.us",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
