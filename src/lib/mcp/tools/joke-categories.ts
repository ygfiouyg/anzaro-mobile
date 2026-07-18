/**
 * MCP Tool: JokeAPI Categories
 * تكامل حقيقي مع JokeAPI v2 — قائمة التصنيفات + flags.
 */
import type { MCPTool } from "../types";

export const jokeCategoriesTool: MCPTool = {
  name: "joke_categories",
  description: "تصنيفات النكت + flags (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'joke categories' أو 'أنواع النكت'.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      const [catRes, flagRes, formatRes] = await Promise.all([
        fetch("https://v2.jokeapi.dev/categories", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }),
        fetch("https://v2.jokeapi.dev/flags", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }),
        fetch("https://v2.jokeapi.dev/formats", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }),
      ]);
      const result: any = { source: "v2.jokeapi.dev" };
      if (catRes.ok) {
        const catData: any = await catRes.json();
        result.categories = {
          available: catData.categories || [],
          category_count: (catData.categories || []).length,
          safe_categories: ["Programming", "Misc", "Pun", "Spooky", "Christmas"],
          unsafe_categories: ["Dark"],
        };
      }
      if (flagRes.ok) {
        const flagData: any = await flagRes.json();
        result.flags = flagData.flags || [];
      }
      if (formatRes.ok) {
        const formatData: any = await formatRes.json();
        result.formats = formatData.formats || [];
      }
      return { success: true, data: result };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
