/**
 * MCP Tool: GitHub Markdown Render
 * تكامل حقيقي مع GitHub REST API — render Markdown بـ GitHub style.
 */
import type { MCPTool } from "../types";

export const githubMarkdownTool: MCPTool = {
  name: "github_markdown",
  description: "render Markdown بـ GitHub style (API حقيقي). استخدمها لما المستخدم يقول 'github markdown' أو 'render md'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "الـ Markdown للـ render" },
      mode: { type: "string", description: "markdown أو gfm (افتراضي: gfm)", default: "gfm" },
      context: { type: "string", description: "repo context للـ gfm (owner/name، اختياري)" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const mode = String(params.mode || "gfm").toLowerCase();
    const context = String(params.context || "").trim();

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 100000) return { success: false, error: "النص طويل جداً" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const body: any = { text, mode };
      if (mode === "gfm" && context) {
        body.context = context;
      }

      const res = await fetch("https://api.github.com/markdown", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { success: false, error: `GitHub Markdown API error ${res.status}` };
      }

      const html = await res.text();

      return {
        success: true,
        data: {
          mode,
          context: context || null,
          markdown_length: text.length,
          html_length: html.length,
          html,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
