/**
 * MCP Tool: GitHub Code Search
 * تكامل حقيقي مع GitHub REST API — بحث في الكود.
 * محتاج GITHUB_TOKEN (code search مش متاح بدون auth).
 */
import type { MCPTool } from "../types";

export const githubCodeSearchTool: MCPTool = {
  name: "github_code_search",
  description: "بحث في كود GitHub repos (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'code search' أو 'دور في كود'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      language: { type: "string", description: "لغة البرمجة (اختياري)" },
      repo: { type: "string", description: "repo محدد owner/name (اختياري)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const language = String(params.language || "").trim();
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));

    if (!query) return { success: false, error: "query مطلوبة" };

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { success: false, error: "GITHUB_TOKEN مطلوب لـ code search" };
    }

    try {
      let q = query;
      if (language) q += ` language:${language}`;
      if (repo) q += ` repo:${repo}`;

      const params2 = new URLSearchParams();
      params2.set("q", q);
      params2.set("per_page", String(count));

      const res = await fetch(`https://api.github.com/search/code?${params2.toString()}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "DeltaAI-MCP/1.0",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 422) {
        return { success: false, error: "code search محدود - جرّب query أبسط" };
      }
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const results = (data.items || []).map((item: any) => ({
        name: item.name || "",
        path: item.path || "",
        url: item.html_url || "",
        sha: item.sha?.slice(0, 7) || "",
        repo: {
          name: item.repository?.full_name || "",
          url: item.repository?.html_url || "",
          description: item.repository?.description || "",
          stars: item.repository?.stargazers_count || 0,
        },
        score: Math.round((item.score || 0) * 100) / 100,
      }));

      return {
        success: true,
        data: {
          query,
          filters: { language: language || null, repo: repo || null },
          total_results: data.total_count || 0,
          shown: results.length,
          results,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
