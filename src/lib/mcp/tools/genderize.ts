/**
 * MCP Tool: Genderize
 * تكامل حقيقي مع Genderize API (مجاني، 1000/يوم بدون key).
 * بي تنبأ بجنس الاسم.
 */
import type { MCPTool } from "../types";

export const genderizeTool: MCPTool = {
  name: "genderize",
  description: "تنبأ بجنس أي اسم (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'gender' أو 'جنس اسم' أو 'genderize'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "الاسم الأول" },
      country: { type: "string", description: "كود الدولة (اختياري، مثلاً: eg, us)" },
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

      const apiKey = process.env.GENDERIZE_API_KEY || "";
      if (apiKey) params2.set("apikey", apiKey);

      const res = await fetch(`https://api.genderize.io?${params2.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Genderize API error ${res.status}` };

      const data: any = await res.json();

      if (!data.gender) {
        return { success: true, data: { name, found: false, message: "مفيش بيانات كافية لهذا الاسم" } };
      }

      const genderAr = data.gender === "male" ? "ذكر" : "أنثى";

      return {
        success: true,
        data: {
          name: data.name,
          found: true,
          gender: data.gender,
          gender_ar: genderAr,
          probability: Math.round((data.probability || 0) * 1000) / 10,
          count: data.count || 0,
          country: country || null,
          source: "genderize.io",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
