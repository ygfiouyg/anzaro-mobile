/**
 * MCP Tool: Open Library Author
 * تكامل حقيقي مع Open Library Author API.
 */
import type { MCPTool } from "../types";

export const openlibAuthorTool: MCPTool = {
  name: "openlib_author",
  description: "معلومات مؤلف من Open Library (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'مؤلف' أو 'author info'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "اسم المؤلف أو OL ID" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      // search for author first
      const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(query)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!searchRes.ok) return { success: false, error: `Open Library error ${searchRes.status}` };

      const searchData: any = await searchRes.json();
      const authors = searchData.docs || [];

      if (authors.length === 0) {
        return { success: false, error: `مفيش مؤلف بـ "${query}"` };
      }

      // get top 5 authors
      const topAuthors = authors.slice(0, 5).map((a: any) => ({
        key: a.key || "",
        name: a.name || "",
        birth_date: a.birth_date || null,
        death_date: a.death_date || null,
        top_work: a.top_work || "",
        work_count: a.work_count || 0,
        top_subjects: a.top_subjects || [],
      }));

      // get details for top author
      const topAuthor = authors[0];
      const olId = topAuthor.key;
      let details: any = null;

      if (olId) {
        try {
          const detailRes = await fetch(`https://openlibrary.org/authors/${olId}.json`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
          });
          if (detailRes.ok) {
            const d: any = await detailRes.json();
            details = {
              bio: d.bio?.value || d.bio || "",
              personal_name: d.personal_name || "",
              alternate_names: d.alternate_names || [],
              remote_ids: {
                wikidata: d.remote_ids?.wikidata || null,
                amazon: d.remote_ids?.amazon || null,
                librarything: d.remote_ids?.librarything || null,
              },
              links: (d.links || []).map((l: any) => ({ url: l.url, title: l.title })),
              photos: d.photos || [],
            };
          }
        } catch {}
      }

      return {
        success: true,
        data: {
          query,
          total_found: searchData.numFound || authors.length,
          shown: topAuthors.length,
          top_authors: topAuthors,
          detailed: details,
          source: "openlibrary.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
