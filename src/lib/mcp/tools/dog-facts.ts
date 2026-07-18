/**
 * MCP Tool: Dog Facts
 * تكامل حقيقي مع Dog API (Dog Facts).
 */
import type { MCPTool } from "../types";

export const dogFactsTool: MCPTool = {
  name: "dog_facts",
  description: "حقائق عشوائية عن الكلاب (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'dog fact' أو 'حقيقة كلاب'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد الحقائق (افتراضي: 1، أقصى: 100)", default: 1 },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(100, Math.max(1, Number(params.count) || 1));

    try {
      const url = `https://dog-api.kinduff.com/api/facts?number=${count}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Dog API error ${res.status}` };

      const data: any = await res.json();

      return {
        success: true,
        data: {
          count: (data.facts || []).length,
          facts: data.facts || [],
          success: data.success !== false,
          source: "dog-api.kinduff.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
