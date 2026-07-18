/**
 * MCP Tool: GitHub Code Scanning Alerts
 * تكامل حقيقي مع GitHub REST API — code scanning alerts.
 */
import type { MCPTool } from "../types";

export const githubCodeScanningTool: MCPTool = {
  name: "github_code_scanning",
  description: "code scanning alerts لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'code scanning' أو 'تحليل كود'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      state: { type: "string", description: "open, closed (افتراضي: open)", default: "open" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 20)", default: 20 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const state = String(params.state || "open").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 20));
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب" };
    try {
      const params2 = new URLSearchParams({ state, per_page: String(count) });
      const res = await fetch(`https://api.github.com/repos/${repo}/code-scanning/alerts?${params2.toString()}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (res.status === 403) return { success: false, error: "محتاج صلاحية security_events" };
      if (res.status === 404) return { success: false, error: "الـ repo مش موجود أو code scanning مش مفعّل" };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };
      const data: any[] = await res.json();
      const alerts = data.map((a: any) => ({ number: a.number, state: a.state, rule: { id: a.rule?.id || "", description: a.rule?.description || "", severity: a.rule?.severity || "", tags: a.rule?.tags || [] }, tool: a.tool?.name || "", created_at: a.created_at, updated_at: a.updated_at, url: a.html_url, most_recent_instance: { ref: a.most_recent_instance?.ref || "", path: a.most_recent_instance?.location?.path || "", start_line: a.most_recent_instance?.location?.start_line || 0, end_line: a.most_recent_instance?.location?.end_line || 0 } }));
      return { success: true, data: { repo, state, total: alerts.length, by_severity: { error: alerts.filter(a => a.rule.severity === "error").length, warning: alerts.filter(a => a.rule.severity === "warning").length, note: alerts.filter(a => a.rule.severity === "note").length }, alerts, rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
