/**
 * MCP Tool: Space People (ISS)
 * تكامل حقيقي مع Open Notify API (مجاني، بدون API key).
 * بيرجّع الناس اللي في الفضاء دلوقتي.
 */
import type { MCPTool } from "../types";

export const spacePeopleTool: MCPTool = {
  name: "space_people",
  description: "مين في الفضاء دلوقتي (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'astronauts' أو 'رواد فضاء'.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      const res = await fetch("http://api.open-notify.org/astros.json", {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Open Notify API error ${res.status}` };

      const data: any = await res.json();

      const people = (data.people || []).map((p: any) => ({
        name: p.name || "",
        craft: p.craft || "",
      }));

      // group by spacecraft
      const craftCount: Record<string, string[]> = {};
      people.forEach((p) => {
        if (!craftCount[p.craft]) craftCount[p.craft] = [];
        craftCount[p.craft].push(p.name);
      });

      return {
        success: true,
        data: {
          total_people: data.number || people.length,
          message: data.message || "success",
          people,
          by_spacecraft: Object.entries(craftCount).map(([craft, names]) => ({
            spacecraft: craft,
            count: names.length,
            astronauts: names,
          })),
          timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : "",
          source: "open-notify.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
