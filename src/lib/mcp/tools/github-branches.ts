/**
 * MCP Tool: GitHub Branches
 * تكامل حقيقي مع GitHub REST API — list branches لأي repo.
 */
import type { MCPTool } from "../types";

export const githubBranchesTool: MCPTool = {
  name: "github_branches",
  description: "list branches لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'branches' أو 'فروع repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 30، أقصى: 100)", default: 30 },
      protected: { type: "boolean", description: "فقط branches المحمية (افتراضي: false)", default: false },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 30));
    const onlyProtected = Boolean(params.protected);

    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=${count}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      let branches = data.map((b: any) => ({
        name: b.name,
        commit: {
          sha: b.commit?.sha?.slice(0, 7) || "",
          url: b.commit?.url || "",
        },
        protected: b.protected || false,
        protection: b.protection ? {
          enabled: b.protection.enabled,
          required_status_checks: b.protection.required_status_checks?.contexts || [],
          enforce_admins: b.protection.enforce_admins?.enabled || false,
          required_pull_request_reviews: !!b.protection.required_pull_request_reviews,
        } : null,
      }));

      if (onlyProtected) {
        branches = branches.filter((b) => b.protected);
      }

      return {
        success: true,
        data: {
          repo,
          total_branches: branches.length,
          protected_count: branches.filter((b) => b.protected).length,
          branches,
          default_branch: branches[0]?.name || null,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
