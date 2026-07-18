/**
 * MCP Tool: Open AI Feed (Hacker News + Product Hunt)
 * تكامل حقيقي مع HN Algolia API + Product Hunt (scrape).
 * بيرجّع آخر الأخبار التقنية.
 */
import type { MCPTool } from "../types";

export const techFeedTool: MCPTool = {
  name: "tech_feed",
  description: "آخر أخبار التقنية من HN (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'tech news' أو 'آخر الأخبار التقنية'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة بحث (اختياري، افتراضي: top stories)" },
      tags: { type: "string", description: "story, comment, poll,pollopt (افتراضي: story)", default: "story" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 50)", default: 10 },
      minPoints: { type: "number", description: "أقل نقاط (افتراضي: 0)", default: 0 },
    },
    required: [],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const tags = String(params.tags || "story").toLowerCase();
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));
    const minPoints = Math.max(0, Number(params.minPoints) || 0);

    try {
      const params2 = new URLSearchParams({
        tags,
        hitsPerPage: String(count * 2), // fetch more to filter
        numericFilters: minPoints > 0 ? `points>=${minPoints}` : "",
      });

      if (query) {
        params2.set("query", query);
      }

      const url = `https://hn.algolia.com/api/v1/${query ? "search" : "search"}?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `HN Algolia API error ${res.status}` };

      const data: any = await res.json();
      const hits = (data.hits || [])
        .filter((h: any) => h.points >= minPoints)
        .slice(0, count)
        .map((h: any) => ({
          id: h.objectID,
          title: h.title || h.story_title || "",
          url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          points: h.points || 0,
          author: h.author || "",
          num_comments: h.num_comments || 0,
          created_at: h.created_at || "",
          created_at_i: h.created_at_i ? new Date(h.created_at_i * 1000).toISOString() : "",
          tags: h._tags || [],
          story_text: h.story_text ? h.story_text.slice(0, 200) : null,
        }));

      return {
        success: true,
        data: {
          query: query || "(top stories)",
          tags,
          total: data.nbHits || 0,
          shown: hits.length,
          min_points: minPoints,
          stories: hits,
          top_story: hits[0] || null,
          source: "hn.algolia.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
