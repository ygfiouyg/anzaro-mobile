/**
 * MCP Tool: GitHub Collaborators
 * تكامل حقيقي مع GitHub REST API — collaborators لأي repo.
 */
import type { MCPTool } from "../types";

export const githubCollaboratorsTool: MCPTool = {
  name: "github_collaborators",
  description: "collaborators لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'collaborators' أو 'فريق repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 30، أقصى: 100)", default: 30 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 30));
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/collaborators?per_page=${count}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 403) return { success: false, error: "محتاج صلاحية admin للـ repo" };
      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const collaborators = data.map((c: any) => ({
        login: c.login,
        id: c.id,
        type: c.type || "User",
        url: c.html_url,
        avatar: c.avatar_url,
        permissions: {
          admin: c.permissions?.admin || false,
          maintain: c.permissions?.maintain || false,
          push: c.permissions?.push || false,
          triage: c.permissions?.triage || false,
          pull: c.permissions?.pull || false,
        },
        site_admin: c.site_admin || false,
      }));

      return {
        success: true,
        data: {
          repo,
          total: collaborators.length,
          admins: collaborators.filter((c) => c.permissions.admin).length,
          write_access: collaborators.filter((c) => c.permissions.push).length,
          collaborators,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
