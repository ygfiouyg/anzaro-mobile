/**
 * MCP Tool: GitHub Languages
 * تكامل حقيقي مع GitHub REST API — توزيع لغات البرمجة في repo.
 */
import type { MCPTool } from "../types";

export const githubLanguagesTool: MCPTool = {
  name: "github_languages",
  description: "توزيع لغات البرمجة في GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'repo languages' أو 'لغات repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/languages`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const entries = Object.entries(data);
      const total = entries.reduce((sum, [, bytes]) => sum + (bytes as number), 0);

      const languages = entries
        .map(([lang, bytes]) => ({
          language: lang,
          bytes: bytes as number,
          percentage: total > 0 ? Math.round(((bytes as number) / total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.bytes - a.bytes);

      return {
        success: true,
        data: {
          repo,
          total_bytes: total,
          languages_count: languages.length,
          primary_language: languages[0]?.language || null,
          languages,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
