/**
 * MCP Tool: GitHub Rate Limit
 * تكامل حقيقي مع GitHub REST API — فحص rate limit.
 */
import type { MCPTool } from "../types";

export const githubRateLimitTool: MCPTool = {
  name: "github_rate_limit",
  description: "فحص GitHub API rate limit (API حقيقي). استخدمها لما المستخدم يقول 'rate limit' أو 'حد الاستخدام'.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch("https://api.github.com/rate_limit", {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const resources = data.resources || {};

      const formatResource = (r: any, name: string) => {
        if (!r) return null;
        const reset = new Date(r.reset * 1000);
        const now = new Date();
        const remainingSeconds = Math.max(0, r.reset - Math.floor(Date.now() / 1000));
        return {
          resource: name,
          limit: r.limit,
          remaining: r.remaining,
          used: r.used,
          reset: reset.toISOString(),
          resets_in_seconds: remainingSeconds,
          resets_in_minutes: Math.round(remainingSeconds / 60),
          percentage_used: r.limit > 0 ? Math.round((r.used / r.limit) * 1000) / 10 : 0,
          percentage_remaining: r.limit > 0 ? Math.round((r.remaining / r.limit) * 1000) / 10 : 0,
        };
      };

      return {
        success: true,
        data: {
          authenticated: !!token,
          rate: formatResource(resources.core, "core"),
          search: formatResource(resources.search, "search"),
          graphql: formatResource(resources.graphql, "graphql"),
          integration_manifest: formatResource(resources.integration_manifest, "integration_manifest"),
          code_search: formatResource(resources.code_search, "code_search"),
          scim: formatResource(resources.scim, "scim"),
          source_migration: formatResource(resources.source_migration, "source_migration"),
          summary: {
            core_remaining: resources.core?.remaining || 0,
            core_limit: resources.core?.limit || 0,
            resets_at: resources.core?.reset ? new Date(resources.core.reset * 1000).toISOString() : null,
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
