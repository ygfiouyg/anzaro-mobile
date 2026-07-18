/**
 * MCP Tool: GitHub Popular Paths
 * تكامل حقيقي مع GitHub REST API — popular paths لأي repo.
 */
import type { MCPTool } from "../types";

export const githubPathsTool: MCPTool = {
  name: "github_paths",
  description: "popular paths لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'popular paths' أو 'أكثر الملفات زيارة'.",
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
      const res = await fetch(`https://api.github.com/repos/${repo}/traffic/popular/paths`, {
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
      const paths = data.map((p: any) => ({
        path: p.path || "",
        title: p.title || "",
        uniques: p.uniques || 0,
        count: p.count || 0,
      }));

      return {
        success: true,
        data: {
          repo,
          total_paths: paths.length,
          top_path: paths[0] || null,
          paths,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
