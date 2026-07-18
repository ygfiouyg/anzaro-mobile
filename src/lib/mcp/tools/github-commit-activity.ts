/**
 * MCP Tool: GitHub Commit Activity
 * تكامل حقيقي مع GitHub REST API — نشاط commits لـ آخر سنة.
 */
import type { MCPTool } from "../types";

export const githubCommitActivityTool: MCPTool = {
  name: "github_commit_activity",
  description: "نشاط commits لـ آخر سنة (API حقيقي). استخدمها لما المستخدم يقول 'commit activity' أو 'نشاط repo'.",
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

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/stats/commit_activity`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 202) {
        return { success: false, error: "GitHub بيجهّز الإحصائيات. جرّب تاني بعد دقيقة." };
      }
      if (res.status === 204 || !res.ok) {
        return { success: false, error: `GitHub API error ${res.status}` };
      }

      const data: any[] = await res.json();

      // aggregate stats
      let totalCommits = 0;
      let totalAdditions = 0;
      let totalDeletions = 0;
      const weekly: any[] = [];

      data.forEach((week: any) => {
        const weekCommits = week.total || 0;
        const weekDate = new Date(week.week * 1000);
        const days = week.days || [];

        let weekAdditions = 0;
        let weekDeletions = 0;
        (week.days || []).forEach((d: number) => {});

        totalCommits += weekCommits;

        weekly.push({
          week_start: weekDate.toISOString().split("T")[0],
          total_commits: weekCommits,
          days: days,
        });
      });

      // find busiest week and day
      const busiestWeek = [...weekly].sort((a, b) => b.total_commits - a.total_commits)[0] || null;

      return {
        success: true,
        data: {
          repo,
          total_weeks: data.length,
          total_commits: totalCommits,
          avg_commits_per_week: data.length > 0 ? Math.round(totalCommits / data.length * 10) / 10 : 0,
          busiest_week: busiestWeek,
          weekly_activity: weekly.slice(-12),
          source: "GitHub Statistics API",
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
