/**
 * MCP Tool: GitHub Gist List
 * تكامل حقيقي مع GitHub REST API — list public gists أو gists بتاعة user.
 */
import type { MCPTool } from "../types";

export const githubGistsListTool: MCPTool = {
  name: "github_gists_list",
  description: "list public gists أو gists بتاعة user (API حقيقي). استخدمها لما المستخدم يقول 'gists list' أو 'قائمة gists'.",
  parameters: {
    type: "object",
    properties: {
      username: { type: "string", description: "اسم المستخدم (افتراضي: public gists)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
      since: { type: "string", description: "من تاريخ YYYY-MM-DD (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const username = String(params.username || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const since = String(params.since || "").trim();

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params2 = new URLSearchParams();
      params2.set("per_page", String(count));
      if (since) params2.set("since", `${since}T00:00:00Z`);

      const url = username
        ? `https://api.github.com/users/${encodeURIComponent(username)}/gists?${params2.toString()}`
        : `https://api.github.com/gists/public?${params2.toString()}`;

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

      if (res.status === 404) return { success: false, error: `المستخدم "${username}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const gists = data.map((g: any) => ({
        id: g.id,
        url: g.html_url,
        description: g.description || "",
        public: g.public !== false,
        created: g.created_at,
        updated: g.updated_at,
        comments: g.comments || 0,
        owner: g.owner ? {
          login: g.owner.login,
          avatar: g.owner.avatar_url,
          url: g.owner.html_url,
        } : null,
        files: Object.keys(g.files || {}).map((fname) => ({
          filename: fname,
          language: g.files[fname].language || "text",
          size: g.files[fname].size || 0,
          raw_url: g.files[fname].raw_url || "",
        })),
        files_count: Object.keys(g.files || {}).length,
      }));

      return {
        success: true,
        data: {
          username: username || null,
          total: gists.length,
          gists,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
