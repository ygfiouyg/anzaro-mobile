/**
 * MCP Tool: Wikipedia Search
 * تكامل حقيقي مع Wikipedia REST API (مفيش AI — API calls مباشرة).
 * بيدوّر على مقالات ويرجّع ملخص + رابط.
 *
 * بيدعم Arabic + English + لغات تانية.
 */
import type { MCPTool } from "../types";

export const wikipediaSearchTool: MCPTool = {
  name: "wikipedia_search",
  description: "ابحث في Wikipedia عن مقالات (API حقيقي). استخدمها لما المستخدم يقول 'ويكيبيديا' أو 'wikipedia' أو 'موسوعة'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      lang: { type: "string", description: "كود اللغة: ar, en, fr, es... (افتراضي: ar)", default: "ar" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5)", default: 5 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const lang = String(params.lang || "ar").toLowerCase();
    const count = Math.min(20, Math.max(1, Number(params.count) || 5));
    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      // 1) بحث في Wikipedia
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${count}&format=json&origin=*`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
      if (!searchRes.ok) {
        return { success: false, error: `Wikipedia API error ${searchRes.status}` };
      }
      const searchData: any = await searchRes.json();
      const searchItems = searchData?.query?.search || [];

      if (searchItems.length === 0) {
        return {
          success: true,
          data: { query, lang, total_results: 0, results: [], note: "مفيش نتائج. جرّب كلمة تانية أو لغة تانية." },
        };
      }

      // 2) لكل نتيجة، نجايب ملخص + رابط
      const results = await Promise.all(
        searchItems.slice(0, count).map(async (item: any) => {
          const title = item.title;
          const pageId = item.pageid;
          // ملخص المقال (extract)
          const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
          try {
            const sumRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(10000) });
            if (sumRes.ok) {
              const sum: any = await sumRes.json();
              return {
                title,
                url: sum.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/?curid=${pageId}`,
                extract: (sum.extract || "").slice(0, 500),
                thumbnail: sum.thumbnail?.source || null,
                description: sum.description || "",
              };
            }
          } catch {}
          // fallback لو الـ summary فشل
          return {
            title,
            url: `https://${lang}.wikipedia.org/?curid=${pageId}`,
            extract: (item.snippet || "").replace(/<[^>]+>/g, ""),
            thumbnail: null,
            description: "",
          };
        }),
      );

      return {
        success: true,
        data: {
          query,
          lang,
          total_results: searchData?.query?.searchinfo?.totalhits || results.length,
          results,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
