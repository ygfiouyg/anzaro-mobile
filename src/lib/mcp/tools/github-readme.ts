/**
 * MCP Tool: GitHub Readme
 * تكامل حقيقي مع GitHub REST API — استخراج README من أي repo.
 */
import type { MCPTool } from "../types";

export const githubReadmeTool: MCPTool = {
  name: "github_readme",
  description: "استخراج README من أي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'readme' أو 'توثيق repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name (مثلاً: facebook/react)" },
      branch: { type: "string", description: "الـ branch (افتراضي: default branch)" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const branch = String(params.branch || "").trim();
    if (!repo) return { success: false, error: "repo مطلوبة (owner/name)" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return { success: false, error: "repo لازم يكون بصيغة owner/name" };
    }

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // 1) نجيب الـ README metadata (default branch)
      const readmeUrl = `https://api.github.com/repos/${repo}/readme`;
      const res = await fetch(readmeUrl, { headers, signal: AbortSignal.timeout(10000) });

      if (res.status === 404) {
        return { success: false, error: `مفيش README في "${repo}"` };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any = await res.json();

      // 2) نحاول نجيب المحتوى الخام
      let content = "";
      let contentRaw: string | null = null;
      try {
        const rawRes = await fetch(data.download_url || `https://raw.githubusercontent.com/${repo}/${data.sha}/README.md`, {
          headers: { "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (rawRes.ok) {
          contentRaw = await rawRes.text();
          content = contentRaw.slice(0, 10000); // حد 10000 حرف
        }
      } catch {}

      // fallback: decode base64 content من الـ API response
      if (!contentRaw && data.content) {
        try {
          contentRaw = Buffer.from(data.content, "base64").toString("utf-8");
          content = contentRaw.slice(0, 10000);
        } catch {}
      }

      return {
        success: true,
        data: {
          repo,
          filename: data.name || "README.md",
          path: data.path || "",
          sha: data.sha || "",
          size: data.size || 0,
          url: data.html_url || "",
          download_url: data.download_url || "",
          encoding: data.encoding || "base64",
          branch: branch || data.ref || "(default)",
          content,
          content_length: contentRaw?.length || 0,
          truncated: (contentRaw?.length || 0) > 10000,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
