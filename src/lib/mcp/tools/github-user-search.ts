/**
 * MCP Tool: GitHub User Search
 * تكامل حقيقي مع GitHub REST API — بحث متقدم في users.
 */
import type { MCPTool } from "../types";

export const githubUserSearchTool: MCPTool = {
  name: "github_user_search",
  description: "بحث متقدم في GitHub users (API حقيقي). استخدمها لما المستخدم يقول 'search users' أو 'دور على users'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      sort: { type: "string", description: "followers, repositories, joined (افتراضي: followers)", default: "followers" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
      type: { type: "string", description: "user أو org (اختياري)" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const sort = String(params.sort || "followers").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const type = String(params.type || "").toLowerCase();

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params2 = new URLSearchParams();
      params2.set("q", query + (type ? ` type:${type}` : ""));
      params2.set("sort", sort);
      params2.set("order", "desc");
      params2.set("per_page", String(count));

      const res = await fetch(`https://api.github.com/search/users?${params2.toString()}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const users = (data.items || []).map((u: any) => ({
        login: u.login,
        id: u.id,
        type: u.type,
        url: u.html_url,
        avatar: u.avatar_url,
        score: Math.round((u.score || 0) * 100) / 100,
      }));

      return {
        success: true,
        data: {
          query,
          total_results: data.total_count || 0,
          shown: users.length,
          sort,
          users,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
