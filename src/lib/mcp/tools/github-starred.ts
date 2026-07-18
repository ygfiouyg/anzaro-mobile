/**
 * MCP Tool: GitHub Starred Repos
 * تكامل حقيقي مع GitHub REST API — starred repos لأي user.
 */
import type { MCPTool } from "../types";

export const githubStarredTool: MCPTool = {
  name: "github_starred",
  description: "starred repos لأي GitHub user (API حقيقي). استخدمها لما المستخدم يقول 'starred' أو 'المفضلة'.",
  parameters: {
    type: "object",
    properties: {
      username: { type: "string", description: "اسم المستخدم" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
      sort: { type: "string", description: "created, updated (افتراضي: created)", default: "created" },
    },
    required: ["username"],
  },
  async execute(params) {
    const username = String(params.username || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const sort = String(params.sort || "created").toLowerCase();

    if (!username) return { success: false, error: "username مطلوب" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.star+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=${count}&sort=${sort}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );

      if (res.status === 404) return { success: false, error: `المستخدم "${username}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const starred = data.map((item: any) => {
        // with Accept: star+json، الـ response فيه { starred_at, repo }
        const repo = item.repo || item;
        return {
          starred_at: item.starred_at || "",
          repo: {
            name: repo.name || "",
            full_name: repo.full_name || "",
            url: repo.html_url || "",
            description: repo.description || "",
            stars: repo.stargazers_count || 0,
            forks: repo.forks_count || 0,
            language: repo.language || null,
            owner: repo.owner?.login || "",
            topics: repo.topics || [],
          },
        };
      });

      // language breakdown
      const langCount: Record<string, number> = {};
      starred.forEach((s) => {
        const lang = s.repo.language || "Unknown";
        langCount[lang] = (langCount[lang] || 0) + 1;
      });
      const topLanguages = Object.entries(langCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang, count]) => ({ language: lang, count, percentage: Math.round((count / starred.length) * 1000) / 10 }));

      return {
        success: true,
        data: {
          username,
          total_starred: starred.length,
          starred,
          top_languages: topLanguages,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
