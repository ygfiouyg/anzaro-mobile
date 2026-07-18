/**
 * MCP Tool: Public APIs Directory
 * تكامل حقيقي مع PublicAPIs.org API (مجاني، بدون API key).
 * بيدوّر على public APIs.
 */
import type { MCPTool } from "../types";

export const publicApisTool: MCPTool = {
  name: "public_apis",
  description: "بحث في public APIs directory (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'public api' أو 'دور على api'.",
  parameters: {
    type: "object",
    properties: {
      category: { type: "string", description: "تصنيف (اختياري: Animals, Anime, Blockchain, Books, Business, Calendar...)" },
      title: { type: "string", description: "فلترة بالاسم (اختياري)" },
      auth: { type: "string", description: "نوع المصادقة (apiKey, OAuth, None...)" },
      https: { type: "boolean", description: "HTTPS فقط (افتراضي: true)", default: true },
      cors: { type: "string", description: "CORS: yes, no, unknown (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const category = String(params.category || "").trim();
    const title = String(params.title || "").trim().toLowerCase();
    const auth = String(params.auth || "").trim();
    const https = params.https !== false;
    const cors = String(params.cors || "").toLowerCase().trim();

    try {
      // PublicAPIs.org API
      const url = "https://api.publicapis.org/entries";
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `PublicAPIs error ${res.status}` };

      const data: any = await res.json();
      let entries: any[] = data.entries || [];

      // filter
      if (category) {
        entries = entries.filter((e: any) => e.Category?.toLowerCase() === category.toLowerCase());
      }
      if (title) {
        entries = entries.filter((e: any) => e.API?.toLowerCase().includes(title));
      }
      if (auth) {
        entries = entries.filter((e: any) => {
          const a = (e.Auth || "").toLowerCase();
          if (auth.toLowerCase() === "none") return a === "" || a === "none";
          return a.includes(auth.toLowerCase());
        });
      }
      if (https) {
        entries = entries.filter((e: any) => e.HTTPS === true);
      }
      if (cors) {
        entries = entries.filter((e: any) => {
          const c = (e.Cors || "").toLowerCase();
          if (cors === "yes") return c === "yes";
          if (cors === "no") return c === "no";
          return c === "unknown";
        });
      }

      // limit results
      const limited = entries.slice(0, 50).map((e: any) => ({
        api: e.API || "",
        description: e.Description || "",
        auth: e.Auth || "None",
        https: e.HTTPS || false,
        cors: e.Cors || "unknown",
        link: e.Link || "",
        category: e.Category || "",
      }));

      // get categories list
      const categories = [...new Set(data.entries?.map((e: any) => e.Category) || [])].sort();

      return {
        success: true,
        data: {
          total_matched: entries.length,
          shown: limited.length,
          filters: {
            category: category || null,
            title: title || null,
            auth: auth || null,
            https,
            cors: cors || null,
          },
          entries: limited,
          available_categories: categories,
          source: "api.publicapis.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
