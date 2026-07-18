/**
 * MCP Tool: GitHub Referrers
 * تكامل حقيقي مع GitHub REST API — top referrers لأي repo.
 */
import type { MCPTool } from "../types";

export const githubReferrersTool: MCPTool = {
  name: "github_referrers",
  description: "top referrers لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'referrers' أو 'مصادر الزيارات'.",
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

    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب" };

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/traffic/popular/referrers`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "DeltaAI-MCP/1.0",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 403) return { success: false, error: "محتاج صلاحية push" };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const referrers = data.map((r: any) => ({
        referrer: r.referrer || "",
        total: r.total || 0,
        uniques: r.uniques || 0,
      }));

      return {
        success: true,
        data: {
          repo,
          total_referrers: referrers.length,
          top_referrer: referrers[0] || null,
          referrers,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
