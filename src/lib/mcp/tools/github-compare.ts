/**
 * MCP Tool: GitHub Branch Compare
 * تكامل حقيقي مع GitHub REST API — مقارنة فرعين في repo.
 */
import type { MCPTool } from "../types";

export const githubCompareTool: MCPTool = {
  name: "github_compare",
  description: "مقارنة فرعين في GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'compare branches' أو 'مقارنة فروع'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      base: { type: "string", description: "الفرع الأساسي (base)" },
      head: { type: "string", description: "الفرع المقارن (head)" },
    },
    required: ["repo", "base", "head"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const base = String(params.base || "").trim();
    const head = String(params.head || "").trim();

    if (!repo || !base || !head) {
      return { success: false, error: "repo, base, head كلهم مطلوبين" };
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return { success: false, error: "repo لازم بصيغة owner/name" };
    }

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const url = `https://api.github.com/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `مش موجود: repo="${repo}" أو base="${base}" أو head="${head}"` };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any = await res.json();

      // commits
      const commits: any[] = (data.commits || []).map((c: any) => ({
        sha: c.sha?.slice(0, 7) || "",
        message: (c.commit?.message || "").split("\n")[0].slice(0, 100),
        author: c.commit?.author?.name || c.author?.login || "",
        date: c.commit?.author?.date || "",
        url: c.html_url || "",
      }));

      // files changed
      const files: any[] = (data.files || []).map((f: any) => ({
        filename: f.filename || "",
        status: f.status || "",
        additions: f.additions || 0,
        deletions: f.deletions || 0,
        changes: f.changes || 0,
        patch: f.patch ? f.patch.slice(0, 500) : null,
      }));

      return {
        success: true,
        data: {
          repo,
          base: {
            ref: base,
            sha: (data.base_commit?.sha || "").slice(0, 7),
          },
          head: {
            ref: head,
            sha: (data.head_commit?.sha || "").slice(0, 7),
          },
          status: data.status || "unknown",
          ahead_by: data.ahead_by || 0,
          behind_by: data.behind_by || 0,
          total_commits: data.total_commits || 0,
          commits,
          files_changed: files.length,
          files: files.slice(0, 50), // حد 50 ملف
          summary: {
            additions: files.reduce((s, f) => s + f.additions, 0),
            deletions: files.reduce((s, f) => s + f.deletions, 0),
            changes: files.reduce((s, f) => s + f.changes, 0),
          },
          merge_base: (data.merge_base_commit?.sha || "").slice(0, 7),
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
