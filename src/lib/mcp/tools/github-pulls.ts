/**
 * MCP Tool: GitHub Pull Requests
 * تكامل حقيقي مع GitHub REST API — list PRs لأي repo.
 */
import type { MCPTool } from "../types";

export const githubPullsTool: MCPTool = {
  name: "github_pulls",
  description: "list pull requests لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'pull requests' أو 'PRs'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      state: { type: "string", description: "open, closed, all (افتراضي: open)", default: "open" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10)", default: 10 },
      sort: { type: "string", description: "created, updated, popularity (افتراضي: created)", default: "created" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const state = String(params.state || "open").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const sort = String(params.sort || "created").toLowerCase();
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
      params2.set("sort", sort);
      params2.set("direction", "desc");

      const res = await fetch(`https://api.github.com/repos/${repo}/pulls?${params2.toString()}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const pulls = data.map((p: any) => ({
        number: p.number,
        title: p.title || "",
        url: p.html_url || "",
        state: p.state || "open",
        draft: p.draft || false,
        merged: !!p.merged_at,
        author: p.user?.login || "",
        created: p.created_at || "",
        updated: p.updated_at || "",
        merged_at: p.merged_at || null,
        mergeable: p.mergeable,
        head: {
          ref: p.head?.ref || "",
          sha: p.head?.sha?.slice(0, 7) || "",
          label: p.head?.label || "",
        },
        base: {
          ref: p.base?.ref || "",
          sha: p.base?.sha?.slice(0, 7) || "",
          label: p.base?.label || "",
        },
        comments: p.comments || 0,
        review_comments: p.review_comments || 0,
        commits: p.commits || 0,
        additions: p.additions || 0,
        deletions: p.deletions || 0,
        changed_files: p.changed_files || 0,
        labels: (p.labels || []).map((l: any) => l.name),
        body: (p.body || "").slice(0, 300),
      }));

      return {
        success: true,
        data: {
          repo,
          state,
          sort,
          total: pulls.length,
          pulls,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
