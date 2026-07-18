/**
 * MCP Tool: Open Library Search
 * تكامل حقيقي مع Open Library Search API (مجاني، بدون API key).
 * بيدوّر على كتب بـ title/author/subject.
 */
import type { MCPTool } from "../types";

export const openlibrarySearchTool: MCPTool = {
  name: "openlibrary_search",
  description: "ابحث في Open Library عن كتب (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'بحث كتاب' أو 'open library'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      field: { type: "string", description: "title, author, subject, q (افتراضي: q)", default: "q" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 100)", default: 5 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const field = String(params.field || "q").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 5));

    if (!query) return { success: false, error: "query مطلوبة" };

    const validFields = ["q", "title", "author", "subject"];
    const selField = validFields.includes(field) ? field : "q";

    try {
      const params2 = new URLSearchParams();
      params2.set(selField, query);
      params2.set("limit", String(count));
      params2.set("fields", "key,title,author_name,first_publish_year,subject,isbn,cover_i,language,number_of_pages_median,ratings_average,ratings_count,edition_count");

      const url = `https://openlibrary.org/search.json?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `Open Library API error ${res.status}` };

      const data: any = await res.json();
      const docs = Array.isArray(data.docs) ? data.docs : [];

      const books = docs.map((d: any) => ({
        title: d.title || "",
        authors: d.author_name || [],
        first_publish_year: d.first_publish_year || null,
        subjects: (d.subject || []).slice(0, 5),
        isbn: Array.isArray(d.isbn) ? d.isbn.slice(0, 3) : [],
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        cover_large: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
        languages: d.language || [],
        pages: d.number_of_pages_median || null,
        rating: d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : null,
        ratings_count: d.ratings_count || 0,
        editions: d.edition_count || 0,
        key: d.key || "",
        url: d.key ? `https://openlibrary.org${d.key}` : "",
      }));

      return {
        success: true,
        data: {
          query,
          field: selField,
          total_found: data.numFound || 0,
          shown: books.length,
          books,
          source: "openlibrary.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
