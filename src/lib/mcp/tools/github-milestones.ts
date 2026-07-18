/**
 * MCP Tool: GitHub Milestones
 * تكامل حقيقي مع GitHub REST API — milestones لأي repo.
 */
import type { MCPTool } from "../types";

export const githubMilestonesTool: MCPTool = {
  name: "github_milestones",
  description: "milestones لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'milestones' أو 'مراحل'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      state: { type: "string", description: "open, closed, all (افتراضي: open)", default: "open" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10)", default: 10 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const state = String(params.state || "open").toLowerCase();
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));

    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(
        `https://api.github.com/repos/${repo}/milestones?state=${state}&per_page=${count}&sort=due_on&direction=asc`,
        { headers, signal: AbortSignal.timeout(10000) }
      );

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const milestones = data.map((m: any) => ({
        id: m.id,
        number: m.number,
        title: m.title || "",
        description: m.description || "",
        creator: m.creator?.login || "",
        url: m.html_url,
        state: m.state,
        created: m.created_at,
        updated: m.updated_at,
        due_on: m.due_on || null,
        closed: m.closed_at || null,
        open_issues: m.open_issues || 0,
        closed_issues: m.closed_issues || 0,
        progress: (m.open_issues + m.closed_issues) > 0
          ? Math.round((m.closed_issues / (m.open_issues + m.closed_issues)) * 1000) / 10
          : 0,
      }));

      return {
        success: true,
        data: {
          repo,
          state,
          total: milestones.length,
          milestones,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
