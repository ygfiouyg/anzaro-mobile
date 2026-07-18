/**
 * MCP Tool: GitHub Action Artifacts
 * تكامل حقيقي مع GitHub REST API — artifacts لأي workflow run.
 */
import type { MCPTool } from "../types";

export const githubActionArtifactsTool: MCPTool = {
  name: "github_action_artifacts",
  description: "artifacts لأي workflow run (API حقيقي). استخدمها لما المستخدم يقول 'artifacts' أو 'ملفات workflow'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      runId: { type: "number", description: "ID الـ workflow run" },
    },
    required: ["repo", "runId"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const runId = Number(params.runId);
    if (!repo || !runId) return { success: false, error: "repo و runId مطلوبين" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };
    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/artifacts`, { headers, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: "الـ run مش موجود" };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };
      const data: any = await res.json();
      const artifacts = (data.artifacts || []).map((a: any) => ({ id: a.id, name: a.name, size_in_bytes: a.size_in_bytes, size_mb: Math.round((a.size_in_bytes / 1048576) * 100) / 100, url: a.archive_download_url, expired: a.expired, expires_at: a.expires_at, created_at: a.created_at, updated_at: a.updated_at, workflow_run: a.workflow_run?.id || null }));
      return { success: true, data: { repo, run_id: runId, total: data.total_count || 0, artifacts, total_size_mb: Math.round(artifacts.reduce((s: number, a: any) => s + a.size_in_bytes, 0) / 1048576 * 100) / 100, rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
