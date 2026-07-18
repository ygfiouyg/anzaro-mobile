/**
 * MCP Tool: GitHub Stargazers
 * تكامل حقيقي مع GitHub REST API — list stargazers لأي repo.
 */
import type { MCPTool } from "../types";

export const githubStargazersTool: MCPTool = {
  name: "github_stargazers",
  description: "list stargazers لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'stargazers' أو 'star users'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 20، أقصى: 100)", default: 20 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 20));

    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.star+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // get first page + repo info
      const [starsRes, repoRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/stargazers?per_page=${count}`, {
          headers,
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`https://api.github.com/repos/${repo}`, {
          headers: { ...headers, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      if (starsRes.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!starsRes.ok) return { success: false, error: `GitHub API error ${starsRes.status}` };

      const starsData: any[] = await starsRes.json();
      const repoData: any = repoRes.ok ? await repoRes.json() : {};

      const stargazers = starsData.map((s: any) => ({
        login: s.user?.login || s.login || "",
        avatar: s.user?.avatar_url || "",
        url: s.user?.html_url || "",
        type: s.user?.type || "User",
        starred_at: s.starred_at || "",
      }));

      return {
        success: true,
        data: {
          repo,
          total_stars: repoData.stargazers_count || stargazers.length,
          shown: stargazers.length,
          stargazers,
          repo_info: {
            name: repoData.full_name || repo,
            description: repoData.description || "",
            url: repoData.html_url || "",
            stars: repoData.stargazers_count || 0,
            forks: repoData.forks_count || 0,
            watchers: repoData.subscribers_count || 0,
            open_issues: repoData.open_issues_count || 0,
            created: repoData.created_at || "",
            updated: repoData.updated_at || "",
          },
          rate_limit_remaining: starsRes.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
