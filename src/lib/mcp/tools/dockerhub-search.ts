/**
 * MCP Tool: Docker Hub Search
 * تكامل حقيقي مع Docker Hub API — بحث في Docker images.
 */
import type { MCPTool } from "../types";

export const dockerhubSearchTool: MCPTool = {
  name: "dockerhub_search",
  description: "بحث في Docker Hub images (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'docker search' أو 'docker images'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
      official: { type: "boolean", description: "فقط official images (افتراضي: false)", default: false },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const official = Boolean(params.official);

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      const params2 = new URLSearchParams({
        query,
        page_size: String(count),
        type: "image",
      });

      if (official) {
        params2.set("official", "true");
      }

      const url = `https://hub.docker.com/v2/search/repositories/?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `Docker Hub API error ${res.status}` };

      const data: any = await res.json();
      const images = (data.results || []).map((r: any) => ({
        name: r.repo_name || "",
        short_description: r.short_description || "",
        star_count: r.star_count || 0,
        pull_count: r.pull_count || 0,
        is_official: r.is_official || false,
        is_automated: r.is_automated || false,
        url: `https://hub.docker.com/${r.repo_name || ""}`,
        logo: r.logo_url ? `https://hub.docker.com${r.logo_url}` : null,
        publisher: r.publisher ? {
          name: r.publisher.name || "",
          url: r.publisher.url || "",
        } : null,
      }));

      return {
        success: true,
        data: {
          query,
          official_only: official,
          total: data.count || images.length,
          shown: images.length,
          images,
          source: "hub.docker.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
