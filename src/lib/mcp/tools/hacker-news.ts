/**
 * MCP Tool: Hacker News Scraper
 * فكرة من: Hacker News Job Listing Scraper + Learn Anything from HN
 */
import type { MCPTool } from "../types";

export const hackerNewsTool: MCPTool = {
  name: "hacker_news",
  description: "اجلب آخر أخبار/وظائف من Hacker News. استخدمها لما المستخدم يقول 'hacker news' أو 'أخبار تقنية'.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", description: "النوع: top, new, jobs, ask", enum: ["top", "new", "jobs", "ask"], default: "top" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5)", default: 5 },
    },
    required: [],
  },
  async execute(params) {
    const type = String(params.type || "top");
    const count = Number(params.count) || 5;
    try {
      const storyTypes: Record<string, string> = { top: "topstories", new: "newstories", jobs: "jobstories", ask: "askstories" };
      const idsRes = await fetch(`https://hacker-news.firebaseio.com/v0/${storyTypes[type] || "topstories"}.json`, { signal: AbortSignal.timeout(10000) });
      if (!idsRes.ok) return { success: false, error: "فشل جلب القصص" };
      const ids: number[] = await idsRes.json();
      const topIds = ids.slice(0, count);
      const stories = await Promise.all(topIds.map(async (id) => {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(10000) });
        const d = await res.json();
        return { title: d?.title || "", url: d?.url || `https://news.ycombinator.com/item?id=${id}`, score: d?.score || 0, by: d?.by || "", time: d?.time || 0 };
      }));
      return { success: true, data: { type, stories } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
