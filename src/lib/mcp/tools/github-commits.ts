/**
 * MCP Tool: GitHub Commits
 * تكامل حقيقي مع GitHub REST API — أحدث commits لأي repo.
 */
import type { MCPTool } from "../types";

export const githubCommitsTool: MCPTool = {
  name: "github_commits",
  description: "أحدث commits لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'commits' أو 'آخر تغييرات repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد الـ commits (افتراضي: 10، أقصى: 50)", default: 10 },
      branch: { type: "string", description: "الـ branch (اختياري)" },
      since: { type: "string", description: "تاريخ بصيغة YYYY-MM-DD (اختياري)" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));
    const branch = String(params.branch || "").trim();
    const since = String(params.since || "").trim();

    if (!repo) return { success: false, error: "repo مطلوبة (owner/name)" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return { success: false, error: "repo لازم يكون بصيغة owner/name" };
    }

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params2 = new URLSearchParams();
      params2.set("per_page", String(count));
      if (branch) params2.set("sha", branch);
      if (since) {
        const d = new Date(since);
        if (!isNaN(d.getTime())) {
          params2.set("since", d.toISOString());
        }
      }

      const url = `https://api.github.com/repos/${repo}/commits?${params2.toString()}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

      if (res.status === 404) {
        return { success: false, error: `الـ repo "${repo}" مش موجود` };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any[] = await res.json();
      if (!Array.isArray(data)) return { success: false, error: "استجابة غير متوقعة" };

      const commits = data.map((c: any) => ({
        sha: c.sha || "",
        short_sha: (c.sha || "").slice(0, 7),
        message: (c.commit?.message || "").split("\n")[0].slice(0, 200),
        full_message: (c.commit?.message || "").slice(0, 1000),
        author: {
          name: c.commit?.author?.name || "",
          email: c.commit?.author?.email || "",
          date: c.commit?.author?.date || "",
        },
        committer: {
          name: c.commit?.committer?.name || "",
          email: c.commit?.committer?.email || "",
          date: c.commit?.committer?.date || "",
        },
        url: c.html_url || "",
        verified: c.commit?.verification?.verified || false,
        verification_reason: c.commit?.verification?.reason || null,
        stats: c.stats
          ? {
              additions: c.stats.additions || 0,
              deletions: c.stats.deletions || 0,
              total: c.stats.total || 0,
            }
          : null,
        files_changed: c.files?.length || 0,
        author_login: c.author?.login || null,
        author_avatar: c.author?.avatar_url || null,
      }));

      // إحصائيات
      const totalAdditions = commits.reduce((sum, c) => sum + (c.stats?.additions || 0), 0);
      const totalDeletions = commits.reduce((sum, c) => sum + (c.stats?.deletions || 0), 0);
      const uniqueAuthors = new Set(commits.map((c) => c.author.name)).size;

      return {
        success: true,
        data: {
          repo,
          branch: branch || "(default)",
          count: commits.length,
          commits,
          stats: {
            total_additions: totalAdditions,
            total_deletions: totalDeletions,
            unique_authors: uniqueAuthors,
            first_commit_date: commits[commits.length - 1]?.author.date || null,
            last_commit_date: commits[0]?.author.date || null,
          },
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
