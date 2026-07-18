/**
 * MCP Tool: GitHub User Repos
 * تكامل حقيقي مع GitHub REST API — قائمة repos لأي user.
 */
import type { MCPTool } from "../types";

export const githubUserReposTool: MCPTool = {
  name: "github_user_repos",
  description: "قائمة repos لأي GitHub user (API حقيقي). استخدمها لما المستخدم يقول 'repos بتاعة' أو 'user repos'.",
  parameters: {
    type: "object",
    properties: {
      username: { type: "string", description: "اسم المستخدم على GitHub" },
      sort: {
        type: "string",
        description: "ترتيب: updated, created, pushed, full-name, stars (افتراضي: stars)",
        default: "stars",
      },
      type: {
        type: "string",
        description: "نوع: all, owner, member, public, private (افتراضي: owner)",
        default: "owner",
      },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 50)", default: 10 },
    },
    required: ["username"],
  },
  async execute(params) {
    const username = String(params.username || "").trim();
    const sort = String(params.sort || "stars").toLowerCase();
    const type = String(params.type || "owner").toLowerCase();
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));

    if (!username) return { success: false, error: "username مطلوب" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const validSorts = ["updated", "created", "pushed", "full-name", "stars"];
      const validTypes = ["all", "owner", "member", "public", "private"];
      const selSort = validSorts.includes(sort) ? sort : "updated";
      const selType = validTypes.includes(type) ? type : "owner";

      // نستخدم sort=stars مع ترتيب desc — لكن GitHub API مش بيدعم stars كـ sort
      // فبنجيب كل repos ونفرزها محلياً لو طلب stars
      const url =
        selSort === "stars"
          ? `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${count}&type=${selType}`
          : `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=${selSort}&per_page=${count}&type=${selType}`;

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `المستخدم "${username}" مش موجود` };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      let repos: any[] = await res.json();
      if (!Array.isArray(repos)) repos = [];

      // فرز محلي لو stars
      if (selSort === "stars") {
        repos.sort((a: any, b: any) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
      }

      const formatted = repos.slice(0, count).map((r: any) => ({
        name: r.name,
        full_name: r.full_name,
        url: r.html_url,
        description: r.description || "",
        language: r.language || null,
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        watchers: r.watchers_count || 0,
        open_issues: r.open_issues_count || 0,
        default_branch: r.default_branch || "main",
        created: r.created_at || "",
        updated: r.updated_at || "",
        pushed: r.pushed_at || "",
        size_kb: r.size || 0,
        license: r.license ? r.license.name : null,
        topics: r.topics || [],
        fork: r.fork || false,
        archived: r.archived || false,
        visibility: r.visibility || "public",
      }));

      return {
        success: true,
        data: {
          username,
          sort: selSort,
          type: selType,
          total: formatted.length,
          repos: formatted,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
