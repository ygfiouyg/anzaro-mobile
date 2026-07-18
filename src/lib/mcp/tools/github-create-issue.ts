/**
 * MCP Tool: GitHub Create Issue
 * تكامل حقيقي مع GitHub REST API — إنشاء issue في repo.
 * محتاج GITHUB_TOKEN env var.
 */
import type { MCPTool } from "../types";

export const githubCreateIssueTool: MCPTool = {
  name: "github_create_issue",
  description: "أنشئ issue في GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'issue' أو 'افتح issue' أو 'بلّغ عن bug'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name (مثلاً: kopabdo/DELTA_AI_V2)" },
      title: { type: "string", description: "عنوان الـ issue" },
      body: { type: "string", description: "وصف الـ issue" },
      labels: { type: "string", description: "labels مفصولة بفواصل (اختياري): bug,enhancement,question" },
    },
    required: ["repo", "title"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const title = String(params.title || "").trim();
    const body = String(params.body || "");
    const labelsRaw = String(params.labels || "").trim();

    if (!repo) return { success: false, error: "repo مطلوبة (owner/name)" };
    if (!title) return { success: false, error: "title مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return { success: false, error: "repo لازم يكون بصيغة owner/name" };
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return {
        success: false,
        error: "GITHUB_TOKEN env var مش متاح. ضيفه في إعدادات الـ Space.",
      };
    }

    try {
      const labels = labelsRaw ? labelsRaw.split(/[,،]/).map((s) => s.trim()).filter(Boolean) : [];

      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "DeltaAI-MCP/1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body: body || undefined,
          labels: labels.length > 0 ? labels : undefined,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any = await res.json();

      return {
        success: true,
        data: {
          issue_number: data.number,
          url: data.html_url,
          title: data.title,
          state: data.state,
          created_at: data.created_at,
          repo,
          labels: (data.labels || []).map((l: any) => l.name),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
