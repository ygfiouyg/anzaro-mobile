/**
 * MCP Tool: GitHub Commit Info
 * تكامل حقيقي مع GitHub REST API — تفاصيل commit محدد.
 */
import type { MCPTool } from "../types";

export const githubCommitInfoTool: MCPTool = {
  name: "github_commit_info",
  description: "تفاصيل commit محدد (API حقيقي). استخدمها لما المستخدم يقول 'commit info' أو 'تفاصيل commit'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      sha: { type: "string", description: "commit SHA (أو branch name)" },
    },
    required: ["repo", "sha"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const sha = String(params.sha || "").trim();

    if (!repo || !sha) return { success: false, error: "repo و sha مطلوبين" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(sha)}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `commit "${sha}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();

      return {
        success: true,
        data: {
          sha: data.sha,
          short_sha: data.sha?.slice(0, 7),
          url: data.html_url,
          message: data.commit?.message || "",
          author: {
            name: data.commit?.author?.name || "",
            email: data.commit?.author?.email || "",
            date: data.commit?.author?.date || "",
          },
          committer: {
            name: data.commit?.committer?.name || "",
            email: data.commit?.committer?.email || "",
            date: data.commit?.committer?.date || "",
          },
          github_author: data.author ? {
            login: data.author.login,
            avatar: data.author.avatar_url,
            url: data.author.html_url,
          } : null,
          github_committer: data.committer ? {
            login: data.committer.login,
            avatar: data.committer.avatar_url,
            url: data.committer.html_url,
          } : null,
          stats: data.stats || null,
          files_changed: (data.files || []).map((f: any) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch ? f.patch.slice(0, 500) : null,
          })),
          files_count: (data.files || []).length,
          parents: (data.parents || []).map((p: any) => p.sha?.slice(0, 7)),
          verified: data.commit?.verification?.verified || false,
          verification_reason: data.commit?.verification?.reason || null,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
