/**
 * MCP Tool: GitHub Emojis
 * تكامل حقيقي مع GitHub REST API — كل emojis المدعومة.
 */
import type { MCPTool } from "../types";

export const githubEmojisTool: MCPTool = {
  name: "github_emojis",
  description: "كل emojis المدعومة في GitHub (API حقيقي). استخدمها لما المستخدم يقول 'github emojis' أو 'رموز github'.",
  parameters: {
    type: "object",
    properties: {
      search: { type: "string", description: "فلترة بالاسم (اختياري)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 50، 0 = الكل)", default: 50 },
    },
    required: [],
  },
  async execute(params) {
    const search = String(params.search || "").toLowerCase().trim();
    const count = Number(params.count) || 50;

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch("https://api.github.com/emojis", {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      let entries = Object.entries(data);

      if (search) {
        entries = entries.filter(([name]) => name.toLowerCase().includes(search));
      }

      const total = entries.length;
      if (count > 0) {
        entries = entries.slice(0, count);
      }

      const emojis = entries.map(([name, url]) => ({
        name,
        shortcode: `:${name}:`,
        url,
      }));

      return {
        success: true,
        data: {
          total_emojis: total,
          shown: emojis.length,
          search: search || null,
          emojis,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
