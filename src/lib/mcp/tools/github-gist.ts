/**
 * MCP Tool: GitHub Gist Info
 * تكامل حقيقي مع GitHub REST API — معلومات + محتوى أي gist.
 */
import type { MCPTool } from "../types";

export const githubGistTool: MCPTool = {
  name: "github_gist",
  description: "معلومات + محتوى أي GitHub gist (API حقيقي). استخدمها لما المستخدم يقول 'gist' أو 'gists'.",
  parameters: {
    type: "object",
    properties: {
      gistId: { type: "string", description: "ID الـ gist (من الـ URL)" },
    },
    required: ["gistId"],
  },
  async execute(params) {
    const gistId = String(params.gistId || "").trim();
    if (!gistId) return { success: false, error: "gistId مطلوب" };
    if (!/^[a-f0-9]+$/i.test(gistId)) {
      return { success: false, error: "gistId لازم يكون hex" };
    }

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `الـ gist "${gistId}" مش موجود` };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any = await res.json();

      // استخراج الملفات
      const files: any[] = [];
      if (data.files) {
        for (const [filename, fileData] of Object.entries(data.files)) {
          files.push({
            filename,
            language: (fileData as any).language || "text",
            size: (fileData as any).size || 0,
            type: (fileData as any).type || "text/plain",
            raw_url: (fileData as any).raw_url || "",
            content: ((fileData as any).content || "").slice(0, 5000), // حد 5000 حرف
            truncated: ((fileData as any).content || "").length > 5000,
          });
        }
      }

      return {
        success: true,
        data: {
          id: data.id || gistId,
          url: data.html_url || `https://gist.github.com/${gistId}`,
          description: data.description || "",
          public: data.public !== false,
          created_at: data.created_at || "",
          updated_at: data.updated_at || "",
          comments: data.comments || 0,
          owner: {
            login: data.owner?.login || "",
            avatar: data.owner?.avatar_url || "",
            url: data.owner?.html_url || "",
          },
          files,
          files_count: files.length,
          total_size: files.reduce((sum, f) => sum + (f.size || 0), 0),
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
