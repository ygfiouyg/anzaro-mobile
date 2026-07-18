/**
 * MCP Tool: Cat Facts
 * تكامل حقيقي مع Cat Fact API (مجاني، بدون API key).
 */
import type { MCPTool } from "../types";

export const catFactsTool: MCPTool = {
  name: "cat_facts",
  description: "حقائق عشوائية عن القطط (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'cat fact' أو 'حقيقة قطط'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد الحقائق (افتراضي: 1، أقصى: 100)", default: 1 },
      minLength: { type: "number", description: "أقل طول للحقيقة (افتراضي: 0)", default: 0 },
      maxLength: { type: "number", description: "أقصى طول للحقيقة (افتراضي: 0 = أي طول)", default: 0 },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(100, Math.max(1, Number(params.count) || 1));
    const minLen = Math.max(0, Number(params.minLength) || 0);
    const maxLen = Math.max(0, Number(params.maxLength) || 0);

    try {
      const params2 = new URLSearchParams({
        limit: String(count),
      });
      if (maxLen > 0) params2.set("max_length", String(maxLen));

      const url = `https://catfact.ninja/facts?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Cat Fact API error ${res.status}` };

      const data: any = await res.json();

      let facts: any[] = (data.data || []).map((f: any) => ({
        fact: f.fact || "",
        length: f.length || 0,
      }));

      // filter by min length
      if (minLen > 0) {
        facts = facts.filter((f) => f.length >= minLen);
      }

      return {
        success: true,
        data: {
          count: facts.length,
          current_page: data.current_page || 1,
          last_page: data.last_page || 1,
          total_facts_available: data.total || 0,
          facts,
          source: "catfact.ninja",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
