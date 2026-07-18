/**
 * MCP Tool: GitHub Notifications
 * تكامل حقيقي مع GitHub REST API — notifications للمستخدم المصادق عليه.
 * محتاج GITHUB_TOKEN مع scope: notifications.
 */
import type { MCPTool } from "../types";

export const githubNotificationsTool: MCPTool = {
  name: "github_notifications",
  description: "GitHub notifications للمستخدم (API حقيقي). استخدمها لما المستخدم يقول 'notifications' أو 'إشعارات'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد النتائج (افتراضي: 20، أقصى: 100)", default: 20 },
      unread: { type: "boolean", description: "فقط غير المقروءة (افتراضي: true)", default: true },
      participating: { type: "boolean", description: "فقط اللي أنا مشترك فيها (افتراضي: false)", default: false },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(100, Math.max(1, Number(params.count) || 20));
    const unread = params.unread !== false;
    const participating = Boolean(params.participating);

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return {
        success: false,
        error: "GITHUB_TOKEN مطلوب مع scope: notifications",
      };
    }

    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        Authorization: `Bearer ${token}`,
      };

      const endpoint = participating
        ? "notifications/participating"
        : "notifications";

      const params2 = new URLSearchParams();
      params2.set("per_page", String(count));
      params2.set("all", "false");

      const res = await fetch(
        `https://api.github.com/${endpoint}?${params2.toString()}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );

      if (res.status === 401) return { success: false, error: "Token غير صالح أو مش معاه scope notifications" };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      let notifications = data.map((n: any) => ({
        id: n.id,
        unread: n.unread,
        reason: n.reason,
        updated: n.updated_at,
        last_read: n.last_read_at || null,
        subject: {
          title: n.subject?.title || "",
          type: n.subject?.type || "",
          url: n.subject?.url || "",
          latest_comment_url: n.subject?.latest_comment_url || "",
        },
        repository: {
          name: n.repository?.full_name || "",
          url: n.repository?.html_url || "",
          owner: n.repository?.owner?.login || "",
        },
      }));

      if (unread) {
        notifications = notifications.filter((n) => n.unread);
      }

      // breakdown by reason
      const reasonCount: Record<string, number> = {};
      notifications.forEach((n) => {
        reasonCount[n.reason] = (reasonCount[n.reason] || 0) + 1;
      });

      // breakdown by repo
      const repoCount: Record<string, number> = {};
      notifications.forEach((n) => {
        const r = n.repository.name;
        repoCount[r] = (repoCount[r] || 0) + 1;
      });

      return {
        success: true,
        data: {
          total: notifications.length,
          unread_count: notifications.filter((n) => n.unread).length,
          participating,
          notifications,
          breakdown_by_reason: reasonCount,
          breakdown_by_repo: Object.entries(repoCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([repo, count]) => ({ repo, count })),
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
