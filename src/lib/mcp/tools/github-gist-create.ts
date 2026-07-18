/**
 * MCP Tool: GitHub Gist Create
 * تكامل حقيقي مع GitHub REST API — إنشاء gist جديد.
 * محتاج GITHUB_TOKEN.
 */
import type { MCPTool } from "../types";

export const githubGistCreateTool: MCPTool = {
  name: "github_gist_create",
  description: "إنشاء gist جديد (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'create gist' أو 'أنشئ gist'.",
  parameters: {
    type: "object",
    properties: {
      filename: { type: "string", description: "اسم الملف" },
      content: { type: "string", description: "محتوى الملف" },
      description: { type: "string", description: "وصف الـ gist (اختياري)" },
      public: { type: "boolean", description: "gist عام؟ (افتراضي: true)", default: true },
    },
    required: ["filename", "content"],
  },
  async execute(params) {
    const filename = String(params.filename || "").trim();
    const content = String(params.content || "");
    const description = String(params.description || "");
    const isPublic = params.public !== false;
    if (!filename || !content) return { success: false, error: "filename و content مطلوبين" };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب" };
    try {
      const res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ description, public: isPublic, files: { [filename]: { content } } }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { const e = await res.text().catch(() => ""); return { success: false, error: `GitHub API error ${res.status}: ${e.slice(0, 200)}` }; }
      const data: any = await res.json();
      return { success: true, data: { id: data.id, url: data.html_url, description: data.description, public: data.public, created_at: data.created_at, files: Object.keys(data.files || {}), owner: data.owner?.login || "", rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
