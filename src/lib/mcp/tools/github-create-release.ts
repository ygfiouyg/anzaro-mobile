/**
 * MCP Tool: GitHub Create Release
 * تكامل حقيقي مع GitHub REST API — إنشاء release جديد.
 * محتاج GITHUB_TOKEN.
 */
import type { MCPTool } from "../types";

export const githubCreateReleaseTool: MCPTool = {
  name: "github_create_release",
  description: "إنشاء release جديد (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'create release' أو 'إصدار جديد'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      tag: { type: "string", description: "اسم الـ tag (مثلاً: v1.0.0)" },
      name: { type: "string", description: "عنوان الـ release (اختياري)" },
      body: { type: "string", description: "وصف الـ release (اختياري)" },
      target: { type: "string", description: "branch/commit الهدف (افتراضي: default branch)", default: "" },
      draft: { type: "boolean", description: "draft؟ (افتراضي: false)", default: false },
      prerelease: { type: "boolean", description: "prerelease؟ (افتراضي: false)", default: false },
    },
    required: ["repo", "tag"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const tag = String(params.tag || "").trim();
    const name = String(params.name || tag);
    const body = String(params.body || "");
    const target = String(params.target || "");
    const draft = Boolean(params.draft);
    const prerelease = Boolean(params.prerelease);
    if (!repo || !tag) return { success: false, error: "repo و tag مطلوبين" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب" };
    try {
      const reqBody: any = { tag_name: tag, name, body, draft, prerelease };
      if (target) reqBody.target_commitish = target;
      const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
        method: "POST",
        headers: { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { const e = await res.text().catch(() => ""); return { success: false, error: `GitHub API error ${res.status}: ${e.slice(0, 200)}` }; }
      const data: any = await res.json();
      return { success: true, data: { id: data.id, tag: data.tag_name, name: data.name, url: data.html_url, draft: data.draft, prerelease: data.prerelease, created_at: data.created_at, author: data.author?.login || "", rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
