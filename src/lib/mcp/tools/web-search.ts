/**
 * MCP Tool — Web Search
 * =====================
 * أداة بحث ويب حقيقية. بتستخدم mcpWebSearch اللي بتعمل fallback
 * من ZAI functions → DuckDuckGo → Wikipedia.
 */
import type { MCPTool } from "../types";
import { mcpWebSearch } from "@/lib/ai-tools/mcp-tools";

export const webSearchTool: MCPTool = {
  name: "web_search",
  description:
    "Search the web for real-time information. Returns a list of results with title, URL, and snippet. Use this for news, facts, current events, or anything not in your training data.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query (e.g. 'latest AI news' or 'مباراة مصر النهاردة').",
      },
      num: {
        type: "number",
        description: "Maximum number of results to return. Default 5.",
        default: 5,
      },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const num = Math.max(1, Math.min(20, Number(params.num) || 5));

    if (!query) {
      return { success: false, error: "query مطلوبة" };
    }

    const result = await mcpWebSearch(query, num);

    if (!result.success) {
      return { success: false, error: "فشل البحث", data: result.raw };
    }

    return {
      success: true,
      data: {
        query,
        count: result.results.length,
        results: result.results,
      },
    };
  },
};
