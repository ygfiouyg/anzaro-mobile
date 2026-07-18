/**
 * MCP Tool — YouTube Search
 * =========================
 * بحث فيديوهات يوتيوب بكلمة مفتاحية عبر YouTube Data API v3.
 * بيحتاج YOUTUBE_API_KEY env var.
 */
import type { MCPTool } from "../types";

interface YouTubeSearchResult {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
}

export const youtubeSearchTool: MCPTool = {
  name: "youtube_search",
  description:
    "Search YouTube for videos by keyword using the YouTube Data API v3. Returns video id, title, channel, publish time, thumbnail. Requires YOUTUBE_API_KEY env var.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (e.g. 'machine learning tutorial' or 'طبخ مصري').",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results. Default 10.",
        default: 10,
      },
      order: {
        type: "string",
        description: "Sort order.",
        enum: ["relevance", "date", "viewCount", "rating"],
        default: "relevance",
      },
      language: {
        type: "string",
        description: "Preferred content language code (e.g. 'ar', 'en'). Optional.",
      },
    },
    required: ["query"],
  },
  async execute(params) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "YOUTUBE_API_KEY env var غير مضبوط. ضع مفتاح YouTube Data API v3.",
      };
    }

    const query = String(params.query || "").trim();
    if (!query) {
      return { success: false, error: "query مطلوبة" };
    }

    const maxResults = Math.max(1, Math.min(50, Number(params.maxResults) || 10));
    const order = (String(params.order || "relevance") as
      | "relevance"
      | "date"
      | "viewCount"
      | "rating");
    const language = params.language ? String(params.language).trim() : undefined;

    try {
      const params2 = new URLSearchParams({
        part: "snippet",
        q: query,
        type: "video",
        maxResults: String(maxResults),
        order,
        key: apiKey,
      });
      if (language) {
        params2.set("relevanceLanguage", language);
      }

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params2.toString()}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: `YouTube API error ${res.status}: ${data?.error?.message || "unknown"}`,
        };
      }

      const results: YouTubeSearchResult[] = (data.items || [])
        .filter((item: any) => item.id?.videoId)
        .map((item: any) => {
          const videoId = item.id.videoId;
          const snip = item.snippet || {};
          return {
            videoId,
            title: snip.title || "",
            description: snip.description || "",
            channelTitle: snip.channelTitle || "",
            publishedAt: snip.publishedAt || "",
            thumbnail:
              snip.thumbnails?.medium?.url ||
              snip.thumbnails?.default?.url ||
              `https://img.youtube.com/vi/${videoId}/default.jpg`,
            url: `https://www.youtube.com/watch?v=${videoId}`,
          };
        });

      return {
        success: true,
        data: {
          query,
          order,
          count: results.length,
          results,
        },
      };
    } catch (e: any) {
      return { success: false, error: `YouTube search error: ${e.message}` };
    }
  },
};
