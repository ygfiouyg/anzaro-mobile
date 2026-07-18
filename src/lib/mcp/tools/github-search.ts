/**
 * MCP Tool: GitHub Search
 * تكامل حقيقي مع GitHub REST API (مفيش AI — API calls مباشرة).
 * بيدوّر على repos, users, أو issues.
 *
 * محتاج GITHUB_TOKEN env var عشان يرفع rate limit (60/ساعة → 5000/ساعة).
 */
import type { MCPTool } from "../types";

export const githubSearchTool: MCPTool = {
  name: "github_search",
  description: "ابحث في GitHub عن repos, users, أو issues (API حقيقي). استخدمها لما المستخدم يقول 'github' أو 'repo' أو 'مستودع'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      type: { type: "string", description: "نوع البحث: repositories, users, issues", default: "repositories" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 30)", default: 5 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const type = String(params.type || "repositories");
    const count = Math.min(30, Math.max(1, Number(params.count) || 5));
    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const validTypes = ["repositories", "users", "issues"];
      const searchType = validTypes.includes(type) ? type : "repositories";

      const url = `https://api.github.com/search/${searchType}?q=${encodeURIComponent(query)}&per_page=${count}&sort=stars&order=desc`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          success: false,
          error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}`,
        };
      }

      const data: any = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const total = data.total_count || 0;

      // تنسيق النتائج حسب النوع
      const results = items.map((item: any) => {
        if (searchType === "repositories") {
          return {
            name: item.full_name,
            url: item.html_url,
            description: item.description || "",
            stars: item.stargazers_count || 0,
            forks: item.forks_count || 0,
            language: item.language || "N/A",
            owner: item.owner?.login || "",
            updated: item.updated_at || "",
          };
        }
        if (searchType === "users") {
          return {
            login: item.login,
            url: item.html_url,
            type: item.type,
            followers: item.followers || 0,
            public_repos: item.public_repos || 0,
            bio: item.bio || "",
          };
        }
        // issues
        return {
          title: item.title,
          url: item.html_url,
          state: item.state,
          number: item.number,
          repo: item.repository_url?.replace("https://api.github.com/repos/", "") || "",
          created: item.created_at || "",
          comments: item.comments || 0,
        };
      });

      return {
        success: true,
        data: {
          type: searchType,
          query,
          total_results: total,
          returned: results.length,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
          results,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
