/**
 * MCP Tool: GitHub Labels
 * تكامل حقيقي مع GitHub REST API — labels لأي repo.
 */
import type { MCPTool } from "../types";

export const githubLabelsTool: MCPTool = {
  name: "github_labels",
  description: "labels لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'labels' أو 'وسوم repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 30، أقصى: 100)", default: 30 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 30));
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/labels?per_page=${count}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const labels = data.map((l: any) => ({
        id: l.id,
        name: l.name || "",
        description: l.description || "",
        color: l.color ? `#${l.color}` : "",
        default: l.default || false,
        url: l.url || "",
        open_issues: l.open_issues || 0,
        closed_issues: l.closed_issues || 0,
      }));

      return {
        success: true,
        data: {
          repo,
          total: labels.length,
          default_labels: labels.filter((l) => l.default).length,
          custom_labels: labels.filter((l) => !l.default).length,
          labels,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
