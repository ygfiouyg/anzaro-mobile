/**
 * MCP Tool: GitHub Environments
 * تكامل حقيقي مع GitHub REST API — environments لأي repo.
 */
import type { MCPTool } from "../types";

export const githubEnvironmentsTool: MCPTool = {
  name: "github_environments",
  description: "environments لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'environments' أو 'بيئات repo'.",
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
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب" };
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/environments`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: `الـ repo مش موجود أو مفيش environments` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };
      const data: any = await res.json();
      const environments = (data.environments || []).map((e: any) => ({ id: e.id, name: e.name, url: e.html_url, created_at: e.created_at, updated_at: e.updated_at, protection_rules: (e.protection_rules || []).map((r: any) => ({ type: r.type, prevented_reviewers: r.prevented_reviewers || false })), deployment_branch_policy: e.deployment_branch_policy ? { protected_branches: e.deployment_branch_policy.protected_branches, custom_branch_policies: e.deployment_branch_policy.custom_branch_policies } : null }));
      return { success: true, data: { repo, total: environments.length, environments, rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
