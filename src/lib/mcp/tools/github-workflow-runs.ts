/**
 * MCP Tool: GitHub Workflow Runs
 * تكامل حقيقي مع GitHub REST API — GitHub Actions workflow runs.
 */
import type { MCPTool } from "../types";

export const githubWorkflowRunsTool: MCPTool = {
  name: "github_workflow_runs",
  description: "GitHub Actions workflow runs (API حقيقي). استخدمها لما المستخدم يقول 'workflow runs' أو 'actions' أو 'CI'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10)", default: 10 },
      status: { type: "string", description: "queued, in_progress, completed (اختياري)" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const status = String(params.status || "").trim().toLowerCase();

    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params2 = new URLSearchParams();
      params2.set("per_page", String(count));
      if (status) params2.set("status", status);

      const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?${params2.toString()}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const runs = (data.workflow_runs || []).map((r: any) => ({
        id: r.id,
        name: r.name || "",
        display_title: r.display_title || "",
        status: r.status,
        conclusion: r.conclusion,
        url: r.html_url,
        created: r.run_started_at || r.created_at,
        updated: r.updated_at,
        event: r.event,
        branch: r.head_branch,
        commit: r.head_sha?.slice(0, 7),
        actor: r.actor?.login || "",
        workflow_id: r.workflow_id,
        run_number: r.run_number,
        run_attempt: r.run_attempt,
        jobs_url: r.jobs_url,
      }));

      const stats = {
        total: runs.length,
        completed: runs.filter((r: any) => r.status === "completed").length,
        in_progress: runs.filter((r: any) => r.status === "in_progress").length,
        queued: runs.filter((r: any) => r.status === "queued").length,
        success: runs.filter((r: any) => r.conclusion === "success").length,
        failure: runs.filter((r: any) => r.conclusion === "failure").length,
        cancelled: runs.filter((r: any) => r.conclusion === "cancelled").length,
      };

      return {
        success: true,
        data: {
          repo,
          total_count: data.total_count || 0,
          shown: runs.length,
          stats,
          success_rate: stats.completed > 0 ? Math.round((stats.success / stats.completed) * 1000) / 10 : 0,
          runs,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
