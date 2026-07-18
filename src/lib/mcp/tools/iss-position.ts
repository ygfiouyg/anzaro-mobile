/**
 * MCP Tool: ISS Position
 * تكامل حقيقي مع Open Notify API — موقع ISS الحالي.
 */
import type { MCPTool } from "../types";

export const issPositionTool: MCPTool = {
  name: "iss_position",
  description: "موقع ISS الحالي (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'ISS' أو 'محطة فضاء' أو 'موقع ISS'.",
  parameters: { type: "object", properties: {}, required: [] },
  async execute() {
    try {
      const res = await fetch("http://api.open-notify.org/iss-now.json", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any = await res.json();
      const pos = data.iss_position || {};
      const lat = parseFloat(pos.latitude || "0");
      const lng = parseFloat(pos.longitude || "0");
      return { success: true, data: { latitude: lat, longitude: lng, timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : "", message: data.message || "", map_url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=4/${lat}/${lng}`, source: "open-notify.org" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
