/**
 * MCP Tool: ISBN Lookup
 * تكامل حقيقي مع Open Library API للبحث بـ ISBN.
 */
import type { MCPTool } from "../types";

export const isbnLookupTool: MCPTool = {
  name: "isbn_lookup",
  description: "معلومات كتاب بـ ISBN (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'isbn' أو 'كتاب بـ رقم'.",
  parameters: {
    type: "object",
    properties: {
      isbn: { type: "string", description: "رقم ISBN-10 أو ISBN-13" },
    },
    required: ["isbn"],
  },
  async execute(params) {
    const isbn = String(params.isbn || "").replace(/[-\s]/g, "");
    if (!isbn) return { success: false, error: "isbn مطلوب" };

    // validate
    if (!/^\d{10}[\dX]?$|^\d{13}$/.test(isbn)) {
      return { success: false, error: "ISBN لازم 10 أو 13 رقم" };
    }

    try {
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Open Library API error ${res.status}` };

      const data: any = await res.json();
      const bookData = data[`ISBN:${isbn}`];

      if (!bookData) {
        return { success: false, error: `مفيش كتاب بـ ISBN "${isbn}"` };
      }

      return {
        success: true,
        data: {
          isbn,
          title: bookData.title || "",
          subtitle: bookData.subtitle || null,
          authors: (bookData.authors || []).map((a: any) => a.name),
          publishers: (bookData.publishers || []).map((p: any) => p.name),
          publish_date: bookData.publish_date || null,
          number_of_pages: bookData.number_of_pages || null,
          cover: bookData.cover
            ? { small: bookData.cover.small, medium: bookData.cover.medium, large: bookData.cover.large }
            : null,
          url: bookData.url || "",
          subjects: (bookData.subjects || []).slice(0, 10).map((s: any) => s.name),
          identifiers: {
            isbn_10: bookData.identifiers?.isbn_10?.[0] || null,
            isbn_13: bookData.identifiers?.isbn_13?.[0] || null,
            lccn: bookData.identifiers?.lccn?.[0] || null,
            oclc: bookData.identifiers?.oclc?.[0] || null,
            goodreads: bookData.identifiers?.goodreads?.[0] || null,
            librarything: bookData.identifiers?.librarything?.[0] || null,
          },
          links: (bookData.links || []).map((l: any) => ({ url: l.url, title: l.title })),
          ebooks: (bookData.ebooks || []).map((e: any) => ({
            url: e.read_url || e.preview_url,
            availability: e.availability || null,
          })),
          source: "openlibrary.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
