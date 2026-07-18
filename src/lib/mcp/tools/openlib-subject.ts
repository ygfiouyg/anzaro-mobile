/**
 * MCP Tool: Open Library Subject
 * تكامل حقيقي مع Open Library Subjects API.
 */
import type { MCPTool } from "../types";

export const openlibSubjectTool: MCPTool = {
  name: "openlib_subject",
  description: "كتب حسب موضوع من Open Library (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'كتب عن' أو 'books about'.",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "الموضوع (مثلاً: programming, history, science)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
      details: { type: "boolean", description: "تفاصيل كاملة (افتراضي: false)", default: false },
    },
    required: ["subject"],
  },
  async execute(params) {
    const subject = String(params.subject || "").trim().toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    const wantDetails = Boolean(params.details);

    if (!subject) return { success: false, error: "subject مطلوب" };

    try {
      const params2 = new URLSearchParams({
        limit: String(count),
      });
      if (wantDetails) params2.set("details", "true");

      const url = `https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `Open Library error ${res.status}` };

      const data: any = await res.json();

      const books = (data.works || []).map((w: any) => ({
        title: w.title || "",
        authors: (w.authors || []).map((a: any) => a.name),
        first_publish_year: w.first_publish_year || null,
        cover: w.cover_id ? `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg` : null,
        cover_large: w.cover_id ? `https://covers.openlibrary.org/b/id/${w.cover_id}-L.jpg` : null,
        editions: w.edition_count || 0,
        key: w.key || "",
        url: w.key ? `https://openlibrary.org${w.key}` : "",
        subjects: (w.subject || []).slice(0, 5),
        ia_box_id: w.ia_box_id || null,
        lending_identifier: w.lending_identifier_s || null,
      }));

      return {
        success: true,
        data: {
          subject: data.name || subject,
          total_works: data.work_count || 0,
          shown: books.length,
          books,
          subject_url: `https://openlibrary.org/subjects/${subject}`,
          source: "openlibrary.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
