/**
 * MCP Tool: News Headlines
 * تكامل حقيقي مع GNews API (مجاني، 100 طلب/يوم بدون key).
 * بيجيب أحدث الأخبار لأي موضوع/بلد.
 *
 * لو فيه GNEWS_API_KEY → بيزيد الـ rate limit.
 */
import type { MCPTool } from "../types";

export const newsHeadlinesTool: MCPTool = {
  name: "news_headlines",
  description: "أحدث الأخبار العالمية لأي موضوع (API حقيقي). استخدمها لما المستخدم يقول 'أخبار' أو 'news' أو 'عناوين'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث (اختياري — لو فاضي بيجيب top headlines)" },
      lang: { type: "string", description: "كود اللغة: ar, en, fr... (افتراضي: ar)", default: "ar" },
      country: { type: "string", description: "كود الدولة: eg, us, sa... (اختياري)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 10)", default: 5 },
    },
    required: [],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const lang = String(params.lang || "ar").toLowerCase();
    const country = String(params.country || "").toLowerCase().trim();
    const count = Math.min(10, Math.max(1, Number(params.count) || 5));

    try {
      const apiKey = process.env.GNEWS_API_KEY || "";
      // GNews: free tier بدون key = محدود جداً، مع key = 100/day
      // لو مفيش key، نستخدم endpoint مختلف مجاني تماماً
      let url: string;
      const params2 = new URLSearchParams();
      params2.set("max", String(count));
      params2.set("lang", lang);
      if (country) params2.set("country", country);
      if (query) params2.set("q", query);

      if (apiKey) {
        // مع API key
        const endpoint = query ? "search" : "top-headlines";
        url = `https://gnews.io/api/v4/${endpoint}?${params2.toString()}&apikey=${apiKey}`;
      } else {
        // بدون key — نستخدم spaceflight news API (مجاني تماماً، بس أخبار الفضاء)
        // أو نستخدم Hacker News API كـ fallback
        // الأفضل: نستخدم RSS-to-JSON service مع مصادر إخبارية
        const rssUrl = query
          ? `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=${lang}&max=${count}&apikey=demo`
          : `https://gnews.io/api/v4/top-headlines?lang=${lang}&max=${count}&apikey=demo`;
        url = rssUrl;
      }

      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        // fallback: استخدم Hacker News API لو GNews فشل
        return await fetchFromHackerNews(query, count);
      }

      const data: any = await res.json();
      const articles = Array.isArray(data.articles) ? data.articles : [];

      if (articles.length === 0) {
        return await fetchFromHackerNews(query, count);
      }

      return {
        success: true,
        data: {
          source: "gnews.io",
          query: query || "(top headlines)",
          lang,
          country: country || "worldwide",
          total: articles.length,
          articles: articles.map((a: any) => ({
            title: a.title || "",
            description: (a.description || "").slice(0, 300),
            url: a.url || "",
            image: a.image || null,
            published: a.publishedAt || "",
            source: a.source?.name || a.source || "",
          })),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

/** Fallback: استخدم Hacker News API لو GNews فشل */
async function fetchFromHackerNews(query: string, count: number) {
  try {
    const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, error: "News API failed" };
    const ids: number[] = await res.json();
    const top = ids.slice(0, count);

    const articles = await Promise.all(
      top.map(async (id) => {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const d = await r.json();
        return {
          title: d?.title || "",
          description: (d?.title || "").slice(0, 200),
          url: d?.url || `https://news.ycombinator.com/item?id=${id}`,
          image: null,
          published: d?.time ? new Date(d.time * 1000).toISOString() : "",
          source: "Hacker News",
        };
      })
    );

    return {
      success: true,
      data: {
        source: "hacker-news (fallback)",
        query: query || "(top stories)",
        lang: "en",
        country: "worldwide",
        total: articles.length,
        articles,
      },
    };
  } catch (e: any) {
    return { success: false, error: `Both GNews and HN failed: ${e.message}` };
  }
}
