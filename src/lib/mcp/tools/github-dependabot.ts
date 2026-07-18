/**
 * MCP Tool: GitHub Dependabot Alerts
 * تكامل حقيقي مع GitHub REST API — dependabot alerts.
 * محتاج GITHUB_TOKEN مع security_events scope.
 */
import type { MCPTool } from "../types";

export const githubDependabotTool: MCPTool = {
  name: "github_dependabot",
  description: "dependabot alerts لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'dependabot' أو 'vulnerabilities'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      state: { type: "string", description: "open, closed, dismissed, fixed (افتراضي: open)", default: "open" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 20، أقصى: 100)", default: 20 },
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
      const res = await fetch(`https://api.github.com/repos/${repo}/dependabot/alerts?${params2.toString()}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (res.status === 403) return { success: false, error: "محتاج صلاحية security_events" };
      if (res.status === 404) return { success: false, error: "الـ repo مش موجود أو Dependabot مش مفعّل" };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };
      const data: any[] = await res.json();
      const alerts = data.map((a: any) => ({ number: a.number, state: a.state, severity: a.security_advisory?.severity || "", summary: a.security_advisory?.summary || "", description: a.security_advisory?.description?.slice(0, 200) || "", package: { name: a.security_vulnerability?.package?.name || "", ecosystem: a.security_vulnerability?.package?.ecosystem || "" }, vulnerable_version_range: a.security_vulnerability?.vulnerable_version_range || "", patched_version: a.security_vulnerability?.first_patched_version?.identifier || "", created_at: a.created_at, updated_at: a.updated_at, dismissed_at: a.dismissed_at, fixed_at: a.fixed_at, url: a.html_url }));
      return { success: true, data: { repo, state, total: alerts.length, critical: alerts.filter(a => a.severity === "critical").length, high: alerts.filter(a => a.severity === "high").length, medium: alerts.filter(a => a.severity === "medium").length, low: alerts.filter(a => a.severity === "low").length, alerts, rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
