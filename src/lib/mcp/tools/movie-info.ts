/**
 * MCP Tool: Movie Info
 * تكامل حقيقي مع OMDb API (مجاني، 1000 طلب/يوم).
 * بيجيب معلومات و_ratings لأي فيلم/مسلسل.
 *
 * محتاج OMDB_API_KEY env var (مجاني من omdbapi.com/apikey.aspx)
 */
import type { MCPTool } from "../types";

export const movieInfoTool: MCPTool = {
  name: "movie_info",
  description: "معلومات وتقييمات أي فيلم/مسلسل (API حقيقي). استخدمها لما المستخدم يقول 'فيلم' أو 'movie' أو 'مسلسل'.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "عنوان الفيلم" },
      year: { type: "string", description: "سنة الإصدار (اختياري)" },
      type: { type: "string", description: "النوع: movie, series, episode (اختياري)", default: "movie" },
    },
    required: ["title"],
  },
  async execute(params) {
    const title = String(params.title || "").trim();
    const year = String(params.year || "").trim();
    const type = String(params.type || "movie").trim();

    if (!title) return { success: false, error: "title مطلوب" };

    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "OMDB_API_KEY env var مش متاح. احصل على مفتاح مجاني من omdbapi.com/apikey.aspx",
      };
    }

    try {
      const params2 = new URLSearchParams();
      params2.set("t", title);
      params2.set("apikey", apiKey);
      if (year) params2.set("y", year);
      if (type) params2.set("type", type);

      const url = `https://www.omdbapi.com/?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `OMDb API error ${res.status}` };
      }

      const data: any = await res.json();

      if (data.Response === "False") {
        return {
          success: false,
          error: data.Error || `الفيلم "${title}" مش موجود`,
        };
      }

      // parse ratings
      const ratings: any[] = Array.isArray(data.Ratings) ? data.Ratings : [];

      return {
        success: true,
        data: {
          title: data.Title || "",
          year: data.Year || "",
          rated: data.Rated || "",
          released: data.Released || "",
          runtime: data.Runtime || "",
          genre: data.Genre || "",
          director: data.Director || "",
          writer: data.Writer || "",
          actors: data.Actors || "",
          plot: data.Plot || "",
          language: data.Language || "",
          country: data.Country || "",
          awards: data.Awards || "",
          poster: data.Poster && data.Poster !== "N/A" ? data.Poster : null,
          imdb_rating: data.imdbRating && data.imdbRating !== "N/A" ? parseFloat(data.imdbRating) : null,
          imdb_votes: data.imdbVotes && data.imdbVotes !== "N/A" ? parseInt(data.imdbVotes.replace(/,/g, "")) : null,
          imdb_id: data.imdbID || "",
          type: data.Type || "movie",
          ratings: ratings.map((r) => ({ source: r.Source, value: r.Value })),
          box_office: data.BoxOffice && data.BoxOffice !== "N/A" ? data.BoxOffice : null,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
