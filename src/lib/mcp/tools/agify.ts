/**
 * MCP Tool: Agify
 * تكامل حقيقي مع Agify API (مجاني، 1000/يوم بدون key).
 * بي تنبأ بالعمر من الاسم.
 */
import type { MCPTool } from "../types";

export const agifyTool: MCPTool = {
  name: "agify",
  description: "تنبأ بعمر أي اسم (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'age' أو 'عمر اسم' أو 'agify'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "الاسم الأول" },
      country: { type: "string", description: "كود الدولة (اختياري)" },
    },
    required: ["name"],
  },
  async execute(params) {
    const name = String(params.name || "").trim();
    const country = String(params.country || "").toLowerCase().trim();
    if (!name) return { success: false, error: "name مطلوب" };

    try {
      const params2 = new URLSearchParams({ name });
      if (country) params2.set("country_id", country);

      const apiKey = process.env.AGIFY_API_KEY || "";
      if (apiKey) params2.set("apikey", apiKey);

      const res = await fetch(`https://api.agify.io?${params2.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Agify API error ${res.status}` };

      const data: any = await res.json();

      if (data.age === null || data.age === undefined) {
        return { success: true, data: { name, found: false, message: "مفيش بيانات كافية" } };
      }

      return {
        success: true,
        data: {
          name: data.name,
          found: true,
          predicted_age: data.age,
          count: data.count || 0,
          country: country || null,
          source: "agify.io",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
