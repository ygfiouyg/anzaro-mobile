/**
 * MCP Tool: OpenStreetMap Geocode
 * تكامل حقيقي مع Nominatim API (مجاني، بدون API key).
 * تحويل عنوان لإحداثيات والعكس.
 */
import type { MCPTool } from "../types";

export const osmGeocodeTool: MCPTool = {
  name: "osm_geocode",
  description: "geocoding من OpenStreetMap (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'geocode' أو 'إحداثيات عنوان'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "العنوان للبحث" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 40)", default: 5 },
      countryCode: { type: "string", description: "كود الدولة (اختياري، مثلاً: eg, sa)" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(40, Math.max(1, Number(params.count) || 5));
    const countryCode = String(params.countryCode || "").toLowerCase().trim();

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      const params2 = new URLSearchParams({
        q: query,
        format: "json",
        limit: String(count),
        addressdetails: "1",
        "accept-language": "ar",
      });
      if (countryCode) params2.set("countrycodes", countryCode);

      const url = `https://nominatim.openstreetmap.org/search?${params2.toString()}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "DeltaAI-MCP/1.0",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `Nominatim API error ${res.status}` };

      const data: any[] = await res.json();
      const results = data.map((r: any) => ({
        place_id: r.place_id,
        lat: parseFloat(r.lat) || 0,
        lon: parseFloat(r.lon) || 0,
        display_name: r.display_name || "",
        type: r.type || "",
        class: r.class || "",
        importance: r.importance || 0,
        boundingbox: r.boundingbox || [],
        address: {
          house_number: r.address?.house_number || "",
          road: r.address?.road || "",
          neighbourhood: r.address?.neighbourhood || "",
          suburb: r.address?.suburb || "",
          city: r.address?.city || r.address?.town || r.address?.village || "",
          county: r.address?.county || "",
          state: r.address?.state || "",
          postcode: r.address?.postcode || "",
          country: r.address?.country || "",
          country_code: (r.address?.country_code || "").toUpperCase(),
        },
        osm_type: r.osm_type || "",
        osm_id: r.osm_id || 0,
      }));

      return {
        success: true,
        data: {
          query,
          total: results.length,
          results,
          maps_url: results[0] ? `https://www.openstreetmap.org/?mlat=${results[0].lat}&mlon=${results[0].lon}#map=16/${results[0].lat}/${results[0].lon}` : null,
          source: "openstreetmap.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
