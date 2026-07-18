/**
 * MCP Tool: Advice Slip
 * تكامل حقيقي مع Advice Slip API (مجاني، بدون API key).
 * بيرجّع نصيحة عشوائية.
 */
import type { MCPTool } from "../types";

export const adviceSlipTool: MCPTool = {
  name: "advice_slip",
  description: "نصيحة عشوائية (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'advice' أو 'نصيحة' أو 'اشوارني'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة بحث (اختياري)" },
      id: { type: "number", description: "ID نصيحة محددة (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const id = Number(params.id) || null;

    try {
      let url: string;
      if (id) {
        url = `https://api.adviceslip.com/advice/${id}`;
      } else if (query) {
        url = `https://api.adviceslip.com/advice/search/${encodeURIComponent(query)}`;
      } else {
        url = "https://api.adviceslip.com/advice";
      }

      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Advice API error ${res.status}` };

      const data: any = await res.json();

      // single advice
      if (data.slip && !Array.isArray(data.slip)) {
        return {
          success: true,
          data: {
            mode: id ? "by_id" : "random",
            id: data.slip.id,
            advice: data.slip.advice,
            source: "api.adviceslip.com",
          },
        };
      }

      // search results
      if (data.slips && Array.isArray(data.slips)) {
        return {
          success: true,
          data: {
            mode: "search",
            query,
            total: data.slips.length,
            results: data.slips.map((s: any) => ({
              id: s.id,
              advice: s.advice,
            })),
            source: "api.adviceslip.com",
          },
        };
      }

      // not found
      if (data.message) {
        return {
          success: true,
          data: {
            mode: query ? "search" : "random",
            query: query || null,
            found: false,
            message: data.message.text || "مفيش نصائح",
          },
        };
      }

      return { success: false, error: "استجابة غير متوقعة" };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
