/**
 * MCP Tool: GitHub Traffic Views
 * تكامل حقيقي مع GitHub REST API — traffic views لأي repo.
 * محتاج GITHUB_TOKEN مع repo scope (push access).
 */
import type { MCPTool } from "../types";

export const githubTrafficTool: MCPTool = {
  name: "github_traffic_views",
  description: "traffic views لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'traffic' أو 'زيارات repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      per: { type: "string", description: "day أو week (افتراضي: day)", default: "day" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const per = String(params.per || "day").toLowerCase();
    if (!repo) return { success: false, error: "repo مطلوب" };

    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب لـ traffic" };

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/traffic/views?per=${per}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "DeltaAI-MCP/1.0",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 403) return { success: false, error: "محتاج صلاحية push للـ repo" };
      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();

      const views = (data.views || []).map((v: any) => ({
        timestamp: v.timestamp,
        date: v.timestamp ? new Date(v.timestamp).toISOString().split("T")[0] : "",
        count: v.count || 0,
        uniques: v.uniques || 0,
      }));

      return {
        success: true,
        data: {
          repo,
          per,
          total_count: data.count || 0,
          total_uniques: data.uniques || 0,
          daily_views: views,
          avg_per_day: views.length > 0 ? Math.round(data.count / views.length) : 0,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
