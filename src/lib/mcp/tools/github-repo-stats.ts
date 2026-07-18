/**
 * MCP Tool: GitHub Repo Stats
 * تكامل حقيقي مع GitHub REST API — إحصائيات repo شاملة.
 */
import type { MCPTool } from "../types";

export const githubRepoStatsTool: MCPTool = {
  name: "github_repo_stats",
  description: "إحصائيات repo شاملة (API حقيقي). استخدمها لما المستخدم يقول 'repo stats' أو 'إحصائيات repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // fetch repo + languages + contributors count in parallel
      const [repoRes, langsRes, contribRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}`, { headers, signal: AbortSignal.timeout(10000) }),
        fetch(`https://api.github.com/repos/${repo}/languages`, { headers, signal: AbortSignal.timeout(10000) }),
        fetch(`https://api.github.com/repos/${repo}/contributors?per_page=1&anon=1`, { headers, signal: AbortSignal.timeout(10000) }),
      ]);

      if (repoRes.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!repoRes.ok) return { success: false, error: `GitHub API error ${repoRes.status}` };

      const repoData: any = await repoRes.json();
      const langsData: any = langsRes.ok ? await langsRes.json() : {};

      // contributor count from link header
      const contribLink = contribRes.headers.get("link") || "";
      let contributorCount = 1;
      const lastPageMatch = contribLink.match(/page=(\d+)>;\s*rel="last"/);
      if (lastPageMatch) {
        contributorCount = parseInt(lastPageMatch[1]);
      }

      const totalLangBytes = Object.values(langsData).reduce((s: number, b: any) => s + b, 0);
      const languages = Object.entries(langsData)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 5)
        .map(([lang, bytes]) => ({
          language: lang,
          bytes: bytes as number,
          percentage: totalLangBytes > 0 ? Math.round(((bytes as number) / totalLangBytes) * 1000) / 10 : 0,
        }));

      // calculate age
      const createdDate = new Date(repoData.created_at);
      const ageDays = Math.floor((Date.now() - createdDate.getTime()) / 86400000);
      const ageYears = Math.round((ageDays / 365) * 10) / 10;

      return {
        success: true,
        data: {
          repo,
          name: repoData.full_name,
          description: repoData.description || "",
          url: repoData.html_url,
          stats: {
            stars: repoData.stargazers_count || 0,
            forks: repoData.forks_count || 0,
            watchers: repoData.subscribers_count || 0,
            open_issues: repoData.open_issues_count || 0,
            network_count: repoData.network_count || 0,
            subscribers: repoData.subscribers_count || 0,
            size_kb: repoData.size || 0,
            contributors: contributorCount,
          },
          languages: {
            primary: languages[0]?.language || null,
            total_bytes: totalLangBytes,
            breakdown: languages,
          },
          timeline: {
            created: repoData.created_at,
            updated: repoData.updated_at,
            pushed: repoData.pushed_at,
            age_days: ageDays,
            age_years: ageYears,
          },
          meta: {
            default_branch: repoData.default_branch || "main",
            license: repoData.license?.name || null,
            topics: repoData.topics || [],
            visibility: repoData.visibility || "public",
            fork: repoData.fork || false,
            archived: repoData.archived || false,
            disabled: repoData.disabled || false,
            has_issues: repoData.has_issues || false,
            has_projects: repoData.has_projects || false,
            has_wiki: repoData.has_wiki || false,
            has_pages: repoData.has_pages || false,
            has_discussions: repoData.has_discussions || false,
            has_downloads: repoData.has_downloads || false,
          },
          owner: {
            login: repoData.owner?.login || "",
            type: repoData.owner?.type || "",
            avatar: repoData.owner?.avatar_url || "",
          },
          rate_limit_remaining: repoRes.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
