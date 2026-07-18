/**
 * MCP Tool: Random Quote
 * تكامل حقيقي مع ZenQuotes API (مجاني تماماً، بدون API key).
 * بيرجّع اقتباس عشوائي أو اقتباسات اليوم.
 */
import type { MCPTool } from "../types";

export const randomQuoteTool: MCPTool = {
  name: "random_quote",
  description: "اقتباس عشواضي أو اقتباسات اليوم (API حقيقي). استخدمها لما المستخدم يقول 'اقتباس' أو 'quote' أو 'حكمة'.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "random (عشوائي) أو today (اقتباس اليوم) أو author (من مؤلف)",
        default: "random",
      },
      author: { type: "string", description: "اسم المؤلف (لـ mode=author، اختياري)" },
      count: { type: "number", description: "عدد الاقتباسات (افتراضي: 1، أقصى: 10)", default: 1 },
    },
    required: [],
  },
  async execute(params) {
    const mode = String(params.mode || "random").toLowerCase();
    const author = String(params.author || "").trim();
    const count = Math.min(10, Math.max(1, Number(params.count) || 1));

    try {
      let url: string;
      switch (mode) {
        case "today":
          url = "https://zenquotes.io/api/today";
          break;
        case "author":
          if (!author) {
            return { success: false, error: "author مطلوب لـ mode=author" };
          }
          url = `https://zenquotes.io/api/quotes/${encodeURIComponent(author.toLowerCase())}`;
          break;
        case "random":
        default:
          // ZenQuotes random endpoint بيرجّع 1 بس، فنجيب أكتر بـ calls متعددة
          if (count === 1) {
            url = "https://zenquotes.io/api/random";
          } else {
            // نجيب من quotes endpoint ونختار عشوائي
            const quotes = await fetchMultipleQuotes(count);
            return {
              success: true,
              data: {
                mode,
                count: quotes.length,
                quotes,
                source: "zenquotes.io",
              },
            };
          }
      }

      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `ZenQuotes API error ${res.status}` };
      }

      const data: any = await res.json();
      const items = Array.isArray(data) ? data : [data];

      const quotes = items.slice(0, count).map((item: any) => ({
        quote: item.q || item.quote || "",
        author: item.a || item.author || "",
      }));

      return {
        success: true,
        data: {
          mode,
          count: quotes.length,
          quotes,
          source: "zenquotes.io",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

/** نجيب quotes متعددة عشوائية */
async function fetchMultipleQuotes(count: number) {
  const quotes: any[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count * 2 && quotes.length < count; i++) {
    try {
      const res = await fetch("https://zenquotes.io/api/random", {
        headers: { "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) break;
      const data: any = await res.json();
      const item = Array.isArray(data) ? data[0] : data;
      const text = item?.q || "";
      if (text && !seen.has(text)) {
        seen.add(text);
        quotes.push({
          quote: text,
          author: item.a || "",
        });
      }
    } catch {
      break;
    }
  }

  return quotes;
}
