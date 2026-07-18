/**
 * MCP Tool: GitHub Forks
 * تكامل حقيقي مع GitHub REST API — list forks لأي repo.
 */
import type { MCPTool } from "../types";

export const githubForksTool: MCPTool = {
  name: "github_forks",
  description: "list forks لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'forks' أو 'فروع مشتقة'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      sort: { type: "string", description: "newest, oldest, stargazers (افتراضي: stargazers)", default: "stargazers" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const sort = String(params.sort || "stargazers").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));

    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    const validSorts = ["newest", "oldest", "stargazers"];
    const selSort = validSorts.includes(sort) ? sort : "stargazers";

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/forks?sort=${selSort}&per_page=${count}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const forks = data.map((f: any) => ({
        full_name: f.full_name,
        url: f.html_url,
        owner: {
          login: f.owner?.login || "",
          avatar: f.owner?.avatar_url || "",
          type: f.owner?.type || "User",
        },
        description: f.description || "",
        stars: f.stargazers_count || 0,
        forks: f.forks_count || 0,
        watchers: f.watchers_count || 0,
        open_issues: f.open_issues_count || 0,
        default_branch: f.default_branch || "main",
        created: f.created_at || "",
        updated: f.updated_at || "",
        pushed: f.pushed_at || "",
        language: f.language || null,
        size_kb: f.size || 0,
      }));

      const totalStars = forks.reduce((s, f) => s + f.stars, 0);

      return {
        success: true,
        data: {
          repo,
          sort: selSort,
          total_forks: forks.length,
          total_stars_in_forks: totalStars,
          avg_stars_per_fork: forks.length > 0 ? Math.round(totalStars / forks.length) : 0,
          top_fork: forks[0] || null,
          forks,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
