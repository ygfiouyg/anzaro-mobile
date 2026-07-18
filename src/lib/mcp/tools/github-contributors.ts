/**
 * MCP Tool: GitHub Contributors
 * تكامل حقيقي مع GitHub REST API — contributors لأي repo.
 */
import type { MCPTool } from "../types";

export const githubContributorsTool: MCPTool = {
  name: "github_contributors",
  description: "contributors لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'contributors' أو 'مساهمين'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/contributors?per_page=${count}&anon=1`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const contributors = data.map((c: any) => ({
        login: c.login || c.name || "anonymous",
        type: c.type || "User",
        avatar: c.avatar_url || "",
        url: c.html_url || "",
        contributions: c.contributions || 0,
      }));

      const totalContributions = contributors.reduce((s, c) => s + c.contributions, 0);

      return {
        success: true,
        data: {
          repo,
          total_contributors: contributors.length,
          total_contributions: totalContributions,
          top_contributor: contributors[0] || null,
          contributors,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
