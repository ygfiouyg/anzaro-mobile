/**
 * MCP Tool: GitHub Webhooks
 * تكامل حقيقي مع GitHub REST API — webhooks لأي repo.
 * محتاج GITHUB_TOKEN مع repo scope.
 */
import type { MCPTool } from "../types";

export const githubHooksTool: MCPTool = {
  name: "github_hooks",
  description: "webhooks لأي GitHub repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'webhooks' أو 'hooks repo'.",
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
    if (!token) {
      return { success: false, error: "GITHUB_TOKEN مطلوب لـ webhooks" };
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/hooks`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "DeltaAI-MCP/1.0",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 403) return { success: false, error: "محتاج صلاحية admin للـ repo" };
      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const hooks = data.map((h: any) => ({
        id: h.id,
        url: h.url || "",
        test_url: h.test_url || "",
        ping_url: h.ping_url || "",
        name: h.name || "",
        type: h.type || "",
        events: h.events || [],
        active: h.active || false,
        config: {
          url: h.config?.url || "",
          content_type: h.config?.content_type || "",
          insecure_ssl: h.config?.insecure_ssl || "0",
        },
        created: h.created_at || "",
        updated: h.updated_at || "",
        last_response: h.last_response ? {
          code: h.last_response.code || null,
          status: h.last_response.status || "",
          message: h.last_response.message || "",
        } : null,
      }));

      return {
        success: true,
        data: {
          repo,
          total: hooks.length,
          active: hooks.filter((h) => h.active).length,
          inactive: hooks.filter((h) => !h.active).length,
          hooks,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
