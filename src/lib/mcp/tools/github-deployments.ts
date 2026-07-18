/**
 * MCP Tool: GitHub Deployments
 * تكامل حقيقي مع GitHub REST API — deployments لأي repo.
 */
import type { MCPTool } from "../types";

export const githubDeploymentsTool: MCPTool = {
  name: "github_deployments",
  description: "deployments لأي repo (API حقيقي). استخدمها لما المستخدم يقول 'deployments' أو 'نشر'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10)", default: 10 },
      environment: { type: "string", description: "فلترة بالـ environment (اختياري)" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const environment = String(params.environment || "").trim();
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };
    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const params2 = new URLSearchParams({ per_page: String(count) });
      if (environment) params2.set("environment", environment);
      const res = await fetch(`https://api.github.com/repos/${repo}/deployments?${params2.toString()}`, { headers, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };
      const data: any[] = await res.json();
      const deployments = data.map((d: any) => ({ id: d.id, sha: d.sha?.slice(0, 7), ref: d.ref || "", task: d.task || "", environment: d.environment || "", created_at: d.created_at, updated_at: d.updated_at, creator: d.creator?.login || "", url: d.url || "", statuses_url: d.statuses_url || "" }));
      const environments = [...new Set(deployments.map(d => d.environment))];
      return { success: true, data: { repo, total: deployments.length, environments, deployments, rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
