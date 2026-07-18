/**
 * MCP Tool: Random Joke
 * تكامل حقيقي مع Official Joke API (مجاني تماماً، بدون API key).
 * بيرجّع نكتة عشوائية (single أو twopart).
 */
import type { MCPTool } from "../types";

export const jokeTool: MCPTool = {
  name: "joke",
  description: "نكتة عشوائية (API حقيقي). استخدمها لما المستخدم يقول 'نكتة' أو 'joke' أو 'اضحكني'.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "النوع: single, twopart, any (افتراضي: any)",
        default: "any",
      },
      category: {
        type: "string",
        description: "التصنيف: programming, misc, dark, pun, spooky, christmas, any (افتراضي: any)",
        default: "any",
      },
      count: { type: "number", description: "عدد النكت (افتراضي: 1، أقصى: 5)", default: 1 },
      lang: { type: "string", description: "اللغة: en, de, es, fr... (افتراضي: en)", default: "en" },
    },
    required: [],
  },
  async execute(params) {
    const type = String(params.type || "any").toLowerCase();
    const category = String(params.category || "any").toLowerCase();
    const count = Math.min(5, Math.max(1, Number(params.count) || 1));
    const lang = String(params.lang || "en").toLowerCase();

    try {
      const validTypes = ["single", "twopart", "any"];
      const validCategories = ["programming", "misc", "dark", "pun", "spooky", "christmas", "any"];
      const selType = validTypes.includes(type) ? type : "any";
      const selCat = validCategories.includes(category) ? category : "any";

      const params2 = new URLSearchParams();
      if (selType !== "any") params2.set("type", selType);
      if (selCat !== "any") params2.set("category", selCat);
      params2.set("lang", lang);
      params2.set("amount", String(count));

      const url = `https://v2.jokeapi.dev/joke/${selCat === "any" ? "Any" : selCat}?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `JokeAPI error ${res.status}` };
      }

      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.message || "JokeAPI error" };
      }

      // لو amount > 1، الـ response بيكون { jokes: [...] }
      const jokesRaw = Array.isArray(data.jokes) ? data.jokes : [data];

      const jokes = jokesRaw.map((j: any) => ({
        type: j.type || "single",
        category: j.category || selCat,
        ...(j.type === "twopart"
          ? { setup: j.setup || "", delivery: j.delivery || "" }
          : { joke: j.joke || "" }),
        flags: j.flags || {},
        id: j.id || null,
        safe: j.safe !== false,
        lang: j.lang || lang,
      }));

      return {
        success: true,
        data: {
          count: jokes.length,
          category: selCat,
          type: selType,
          lang,
          jokes,
          source: "jokeapi.dev",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
