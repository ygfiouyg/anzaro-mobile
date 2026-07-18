/**
 * MCP Tool: GitHub Octocat (Zen)
 * تكامل حقيقي مع GitHub Zen API (مجاني، بدون API key).
 * بيرجّع اقتباس Zen من GitHub.
 */
import type { MCPTool } from "../types";

export const githubZenTool: MCPTool = {
  name: "github_zen",
  description: "اقتباس Zen من GitHub (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'zen' أو 'github zen' أو 'حكمة'.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      const res = await fetch("https://api.github.com/zen", {
        headers: {
          Accept: "text/plain",
          "User-Agent": "DeltaAI-MCP/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `GitHub Zen API error ${res.status}` };

      const zen = await res.text();

      // also get the octocat
      const octocatRes = await fetch("https://api.github.com/octocat", {
        headers: {
          Accept: "text/plain",
          "User-Agent": "DeltaAI-MCP/1.0",
        },
        signal: AbortSignal.timeout(5000),
      });

      const octocat = octocatRes.ok ? await octocatRes.text() : "";

      return {
        success: true,
        data: {
          zen,
          octocat: octocat.slice(0, 500),
          source: "api.github.com/zen",
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
