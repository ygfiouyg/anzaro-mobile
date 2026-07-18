/**
 * MCP Tool: TMDB Search
 * تكامل حقيقي مع TMDB API (محتاج API key مجاني).
 * بيدوّر على أفلام ومسلسلات.
 */
import type { MCPTool } from "../types";

export const tmdbSearchTool: MCPTool = {
  name: "tmdb_search",
  description: "بحث في أفلام/مسلسلات TMDB (API حقيقي). استخدمها لما المستخدم يقول 'tmdb' أو 'فيلم search'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      type: { type: "string", description: "movie, tv, multi (افتراضي: multi)", default: "multi" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 20)", default: 5 },
      year: { type: "number", description: "سنة محددة (اختياري)" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const type = String(params.type || "multi").toLowerCase();
    const count = Math.min(20, Math.max(1, Number(params.count) || 5));
    const year = Number(params.year) || null;

    if (!query) return { success: false, error: "query مطلوبة" };

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      return { success: false, error: "TMDB_API_KEY مطلوب. احصل عليه من themoviedb.org/settings/api" };
    }

    try {
      const validTypes = ["movie", "tv", "multi"];
      const selType = validTypes.includes(type) ? type : "multi";

      const params2 = new URLSearchParams({
        api_key: apiKey,
        query,
        page: "1",
        include_adult: "false",
        language: "en-US",
      });
      if (year && selType === "movie") params2.set("year", String(year));
      if (year && selType === "tv") params2.set("first_air_date_year", String(year));

      const url = `https://api.themoviedb.org/3/search/${selType}?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `TMDB API error ${res.status}` };

      const data: any = await res.json();
      const results = (data.results || []).slice(0, count).map((r: any) => {
        const isMovie = r.media_type === "movie" || selType === "movie";
        return {
          id: r.id,
          type: isMovie ? "movie" : "tv",
          title: r.title || r.name || "",
          original_title: r.original_title || r.original_name || "",
          release_date: r.release_date || r.first_air_date || "",
          overview: (r.overview || "").slice(0, 300),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          backdrop: r.backdrop_path ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}` : null,
          vote_average: r.vote_average || 0,
          vote_count: r.vote_count || 0,
          popularity: r.popularity || 0,
          original_language: r.original_language || "",
          genre_ids: r.genre_ids || [],
          adult: r.adult || false,
          url: isMovie
            ? `https://www.themoviedb.org/movie/${r.id}`
            : `https://www.themoviedb.org/tv/${r.id}`,
        };
      });

      return {
        success: true,
        data: {
          query,
          type: selType,
          year: year,
          total_results: data.total_results || 0,
          shown: results.length,
          results,
          source: "themoviedb.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
