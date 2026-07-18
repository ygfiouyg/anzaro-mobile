/**
 * MCP Tool: GitHub Organization Info
 * تكامل حقيقي مع GitHub REST API — معلومات أي organization.
 */
import type { MCPTool } from "../types";

export const githubOrgInfoTool: MCPTool = {
  name: "github_org_info",
  description: "معلومات GitHub organization (API حقيقي). استخدمها لما المستخدم يقول 'organization' أو 'org info'.",
  parameters: {
    type: "object",
    properties: {
      org: { type: "string", description: "اسم الـ organization" },
    },
    required: ["org"],
  },
  async execute(params) {
    const org = String(params.org || "").trim();
    if (!org) return { success: false, error: "org مطلوب" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const [orgRes, reposRes, membersRes] = await Promise.all([
        fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}`, {
          headers,
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/repos?sort=stars&per_page=5&type=public`, {
          headers,
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/members?per_page=5`, {
          headers,
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      if (orgRes.status === 404) return { success: false, error: `الـ organization "${org}" مش موجودة` };
      if (!orgRes.ok) return { success: false, error: `GitHub API error ${orgRes.status}` };

      const orgData: any = await orgRes.json();
      const reposData: any[] = reposRes.ok ? await reposRes.json() : [];
      const membersData: any[] = membersRes.ok ? await membersRes.json() : [];

      return {
        success: true,
        data: {
          login: orgData.login,
          id: orgData.id,
          name: orgData.name || orgData.login,
          description: orgData.description || "",
          url: orgData.html_url,
          avatar: orgData.avatar_url,
          blog: orgData.blog || null,
          email: orgData.email || null,
          twitter: orgData.twitter_username || null,
          location: orgData.location || null,
          company: orgData.company || null,
          type: orgData.type || "Organization",
          created: orgData.created_at || "",
          updated: orgData.updated_at || "",
          verified: orgData.is_verified || false,
          public_repos: orgData.public_repos || 0,
          public_gists: orgData.public_gists || 0,
          followers: orgData.followers || 0,
          following: orgData.following || 0,
          top_repos: reposData.map((r: any) => ({
            name: r.name,
            full_name: r.full_name,
            url: r.html_url,
            description: r.description || "",
            stars: r.stargazers_count || 0,
            forks: r.forks_count || 0,
            language: r.language || null,
          })),
          members: membersData.map((m: any) => ({
            login: m.login,
            avatar: m.avatar_url,
            url: m.html_url,
            type: m.type || "User",
          })),
          rate_limit_remaining: orgRes.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
