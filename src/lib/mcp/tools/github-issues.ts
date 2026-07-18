/**
 * MCP Tool: GitHub Issues
 * تكامل حقيقي مع GitHub REST API — list issues لأي repo.
 */
import type { MCPTool } from "../types";

export const githubIssuesTool: MCPTool = {
  name: "github_issues",
  description: "list issues لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'issues' أو 'مشاكل repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      state: { type: "string", description: "open, closed, all (افتراضي: open)", default: "open" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10)", default: 10 },
      labels: { type: "string", description: "filter بالـ labels (اختياري)" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const state = String(params.state || "open").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const labels = String(params.labels || "").trim();
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
      params2.set("state", state);
      params2.set("per_page", String(count));
      params2.set("sort", "created");
      params2.set("direction", "desc");
      if (labels) params2.set("labels", labels);

      const res = await fetch(`https://api.github.com/repos/${repo}/issues?${params2.toString()}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      // filter out pull requests (GitHub API puts PRs in issues endpoint)
      const issues = data.filter((i: any) => !i.pull_request).map((i: any) => ({
        number: i.number,
        title: i.title || "",
        url: i.html_url || "",
        state: i.state || "open",
        author: i.user?.login || "",
        created: i.created_at || "",
        updated: i.updated_at || "",
        comments: i.comments || 0,
        labels: (i.labels || []).map((l: any) => l.name),
        assignees: (i.assignees || []).map((a: any) => a.login),
        body: (i.body || "").slice(0, 300),
      }));

      return {
        success: true,
        data: {
          repo,
          state,
          total: issues.length,
          issues,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
