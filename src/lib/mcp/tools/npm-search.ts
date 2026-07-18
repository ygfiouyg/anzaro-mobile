/**
 * MCP Tool: npm Search
 * تكامل حقيقي مع npm search API — بحث في packages.
 */
import type { MCPTool } from "../types";

export const npmSearchTool: MCPTool = {
  name: "npm_search",
  description: "بحث في npm packages (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'npm search' أو 'دور على package'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 250)", default: 10 },
      quality: { type: "number", description: "وزن الجودة 0-5 (افتراضي: 1.95)", default: 1.95 },
      popularity: { type: "number", description: "وزن الشعبية 0-5 (افتراضي: 3.15)", default: 3.15 },
      maintenance: { type: "number", description: "وزن الصيانة 0-5 (افتراضي: 2.05)", default: 2.05 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(250, Math.max(1, Number(params.count) || 10));
    const quality = Math.min(5, Math.max(0, Number(params.quality) || 1.95));
    const popularity = Math.min(5, Math.max(0, Number(params.popularity) || 3.15));
    const maintenance = Math.min(5, Math.max(0, Number(params.maintenance) || 2.05));

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      const body = {
        text: query,
        size: count,
        from: 0,
        quality,
        popularity,
        maintenance,
      };

      const res = await fetch("https://registry.npmjs.org/-/v1/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "DeltaAI-MCP/1.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `npm search API error ${res.status}` };

      const data: any = await res.json();
      const packages = (data.objects || []).map((o: any) => {
        const pkg = o.package || {};
        const flags = o.flags || {};
        return {
          name: pkg.name || "",
          version: pkg.version || "",
          description: pkg.description || "",
          keywords: pkg.keywords || [],
          license: pkg.license || null,
          homepage: pkg.links?.homepage || null,
          npm_url: pkg.links?.npm || "",
          repo: pkg.links?.repository || null,
          bugs: pkg.links?.bugs || null,
          publisher: pkg.publisher ? {
            username: pkg.publisher.username || "",
            email: pkg.publisher.email || "",
          } : null,
          date: pkg.date || "",
          search_score: o.searchScore ? Math.round(o.searchScore * 1000) / 1000 : 0,
          deprecated: flags.deprecated || false,
        };
      });

      return {
        success: true,
        data: {
          query,
          total: data.total || 0,
          shown: packages.length,
          packages,
          source: "registry.npmjs.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
