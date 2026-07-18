/**
 * MCP Tool: News Aggregator
 * سيناريو: اجمع أخبار من مصادر → لخّص → صنّف
 * n8n template: "Scrape and summarize posts of a news site without RSS feed using AI"
 * 
 * الخطوات:
 * 1. ابحث في HN + Wikipedia عن الموضوع
 * 2. اجمع أحدث الأخبار
 * 3. لخّص وصنّف
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const newsAggregatorTool: MCPTool = {
  name: "news_aggregator",
  description: "اجمع أخبار من مصادر متعددة + لخّص وصنّف (سيناريو متكامل). استخدمها لما المستخدم يقول 'أخبار عن' أو 'news about' أو 'آخر المستجدات'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع الأخبار" },
      count: { type: "number", description: "عدد الأخبار (افتراضي: 10)", default: 10 },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "").trim();
    const count = Math.min(20, Math.max(3, Number(params.count) || 10));
    if (!topic) return { success: false, error: "topic مطلوب" };

    try {
      // ═══ 1) HN search ═══
      let hnStories: any[] = [];
      try {
        const hnRes = await fetch(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=${count}&numericFilters=points>5`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (hnRes.ok) {
          const hd: any = await hnRes.json();
          hnStories = (hd.hits || []).map((h: any) => ({
            title: h.title || "",
            url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
            points: h.points || 0,
            comments: h.num_comments || 0,
            date: h.created_at ? new Date(h.created_at).toISOString().split("T")[0] : "",
          }));
        }
      } catch {}

      // ═══ 2) Wikipedia (للمعلومات الأساسية) ═══
      let wikiInfo: any = null;
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (wikiRes.ok) {
          const wd: any = await wikiRes.json();
          if (wd.query?.search?.[0]) {
            const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wd.query.search[0].title)}`, { signal: AbortSignal.timeout(5000) });
            if (sumRes.ok) { const sd: any = await sumRes.json(); wikiInfo = { title: sd.title, extract: (sd.extract || "").slice(0, 300) }; }
          }
        }
      } catch {}

      // ═══ 3) Reddit RSS (مصدر إضافي) ═══
      let redditPosts: any[] = [];
      try {
        const rdRes = await fetch(`https://www.reddit.com/search.rss?q=${encodeURIComponent(topic)}&limit=5&sort=new`, { headers: { "User-Agent": "DeltaAI/1.0" }, signal: AbortSignal.timeout(8000) });
        if (rdRes.ok) {
          const xml = await rdRes.text();
          const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
          let m;
          while ((m = entryRe.exec(xml)) && redditPosts.length < 5) {
            const title = m[1].match(/<title>([^<]+)<\/title>/)?.[1] || "";
            const link = m[1].match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
            if (title) redditPosts.push({ title: title.replace(/&amp;/g, "&"), url: link });
          }
        }
      } catch {}

      // ═══ 4) لخّص وصنّف ═══
      const allNews = [...hnStories.map(s => s.title), ...redditPosts.map(p => p.title)];
      const summary = await callGLMForJSON({
        systemPrompt: `أنت محرر أخبار. لخّص ${allNews.length} خبر عن "${topic}".
رجّع JSON: {"headlines":["أهم 3 عناوين"],"categories":["تصنيف 1"],"summary":"ملخص","trending":""}`,
        userMessage: allNews.join("\n").slice(0, 1500),
        maxTokens: 500,
        temperature: 0.3,
      });

      return {
        success: true,
        data: {
          scenario: "news_aggregator",
          topic,
          steps: { fetch_hn: hnStories.length > 0, fetch_reddit: redditPosts.length > 0, fetch_wiki: !!wikiInfo, summarize: !!summary.data?.summary },
          sources: { hacker_news: hnStories.length, reddit: redditPosts.length, wikipedia: !!wikiInfo },
          stories: { hacker_news: hnStories, reddit: redditPosts },
          wikipedia: wikiInfo,
          report: summary.data || {},
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
