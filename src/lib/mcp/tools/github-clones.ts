/**
 * MCP Tool: GitHub Clones
 * تكامل حقيقي مع GitHub REST API — clone statistics لأي repo.
 */
import type { MCPTool } from "../types";

export const githubClonesTool: MCPTool = {
  name: "github_clones",
  description: "clone statistics لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'clones' أو 'تنزيلات git'.",
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
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب" };

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/traffic/clones?per=${per}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "DeltaAI-MCP/1.0",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 403) return { success: false, error: "محتاج صلاحية push" };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();

      const clones = (data.clones || []).map((c: any) => ({
        timestamp: c.timestamp,
        date: c.timestamp ? new Date(c.timestamp).toISOString().split("T")[0] : "",
        count: c.count || 0,
        uniques: c.uniques || 0,
      }));

      return {
        success: true,
        data: {
          repo,
          per,
          total_count: data.count || 0,
          total_uniques: data.uniques || 0,
          daily_clones: clones,
          avg_per_day: clones.length > 0 ? Math.round(data.count / clones.length) : 0,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
