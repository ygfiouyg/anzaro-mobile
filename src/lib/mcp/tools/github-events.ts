/**
 * MCP Tool: GitHub User Events
 * تكامل حقيقي مع GitHub REST API — recent public events لأي user.
 */
import type { MCPTool } from "../types";

export const githubEventsTool: MCPTool = {
  name: "github_events",
  description: "recent public events لأي GitHub user (API حقيقي). استخدمها لما المستخدم يقول 'events' أو 'نشاط user'.",
  parameters: {
    type: "object",
    properties: {
      username: { type: "string", description: "اسم المستخدم" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 20، أقصى: 100)", default: 20 },
    },
    required: ["username"],
  },
  async execute(params) {
    const username = String(params.username || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 20));

    if (!username) return { success: false, error: "username مطلوب" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=${count}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );

      if (res.status === 404) return { success: false, error: `المستخدم "${username}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const events = data.map((e: any) => {
        const event: any = {
          id: e.id,
          type: e.type,
          actor: {
            login: e.actor?.login || "",
            avatar: e.actor?.avatar_url || "",
          },
          repo: {
            name: e.repo?.name || "",
            url: `https://github.com/${e.repo?.name || ""}`,
          },
          created: e.created_at || "",
          public: e.public !== false,
        };

        // event-specific details
        if (e.type === "PushEvent") {
          event.payload = {
            ref: e.payload?.ref || "",
            size: e.payload?.size || 0,
            commits: (e.payload?.commits || []).map((c: any) => ({
              sha: c.sha?.slice(0, 7),
              message: c.message?.split("\n")[0] || "",
              author: c.author?.name || "",
            })),
          };
        } else if (e.type === "CreateEvent") {
          event.payload = {
            ref: e.payload?.ref || "",
            ref_type: e.payload?.ref_type || "",
            master_branch: e.payload?.master_branch || "",
          };
        } else if (e.type === "WatchEvent") {
          event.payload = { action: e.payload?.action || "" };
        } else if (e.type === "ForkEvent") {
          event.payload = {
            forkee: e.payload?.forkee?.full_name || "",
          };
        } else if (e.type === "IssuesEvent") {
          event.payload = {
            action: e.payload?.action || "",
            issue_number: e.payload?.issue?.number,
            issue_title: e.payload?.issue?.title || "",
          };
        } else if (e.type === "PullRequestEvent") {
          event.payload = {
            action: e.payload?.action || "",
            pr_number: e.payload?.pull_request?.number,
            pr_title: e.payload?.pull_request?.title || "",
            merged: e.payload?.pull_request?.merged || false,
          };
        } else if (e.type === "ReleaseEvent") {
          event.payload = {
            action: e.payload?.action || "",
            release_tag: e.payload?.release?.tag_name || "",
            release_name: e.payload?.release?.name || "",
          };
        }

        return event;
      });

      // activity breakdown
      const typeCount: Record<string, number> = {};
      events.forEach((e) => {
        typeCount[e.type] = (typeCount[e.type] || 0) + 1;
      });

      return {
        success: true,
        data: {
          username,
          total_events: events.length,
          events,
          activity_breakdown: Object.entries(typeCount)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => ({ type, count })),
          recent_repos: [...new Set(events.map((e) => e.repo.name))].slice(0, 10),
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
