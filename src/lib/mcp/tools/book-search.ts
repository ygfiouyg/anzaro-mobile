/**
 * MCP Tool: Book Search
 * تكامل حقيقي مع Open Library API (مجاني تماماً، بدون API key).
 * بيدوّر على كتب ويرجّع معلومات + غلاف.
 */
import type { MCPTool } from "../types";

export const bookSearchTool: MCPTool = {
  name: "book_search",
  description: "ابحث عن كتب في Open Library (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'كتاب' أو 'book' أو 'مكتبة'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث (عنوان، مؤلف، أو موضوع)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 20)", default: 5 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(20, Math.max(1, Number(params.count) || 5));
    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      // Open Library Search API
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${count}&fields=key,title,author_name,first_publish_year,subject,isbn,cover_i,language,number_of_pages_median,ratings_average`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { success: false, error: `Open Library API error ${res.status}` };
      }

      const data: any = await res.json();
      const docs = Array.isArray(data.docs) ? data.docs : [];

      const books = docs.map((doc: any) => ({
        title: doc.title || "",
        authors: Array.isArray(doc.author_name) ? doc.author_name.slice(0, 3) : [],
        first_published: doc.first_publish_year || null,
        subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 5) : [],
        isbn: Array.isArray(doc.isbn) ? doc.isbn[0] : null,
        cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
        cover_large: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
        languages: Array.isArray(doc.language) ? doc.language.slice(0, 3) : [],
        pages: doc.number_of_pages_median || null,
        rating: doc.ratings_average ? Math.round(doc.ratings_average * 10) / 10 : null,
        key: doc.key ? `https://openlibrary.org${doc.key}` : null,
      }));

      return {
        success: true,
        data: {
          query,
          total_found: data.numFound || 0,
          returned: books.length,
          books,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
