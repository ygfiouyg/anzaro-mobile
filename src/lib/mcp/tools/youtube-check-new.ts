/**
 * MCP Tool — YouTube Check New Videos
 * ===================================
 * فحص آخر فيديوهات قناة يوتيوب (آخر 24 ساعة أو آخر N فيديو).
 * بيستخدم YouTube Data API v3 + YOUTUBE_API_KEY env var.
 */
import type { MCPTool } from "../types";

interface YouTubeVideoItem {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
}

export const youtubeCheckNewTool: MCPTool = {
  name: "youtube_check_new",
  description:
    "Check the latest videos uploaded by a YouTube channel in the last 24 hours (or any custom window). Requires YOUTUBE_API_KEY env var. Returns video id, title, publish time, thumbnail.",
  parameters: {
    type: "object",
    properties: {
      channelId: {
        type: "string",
        description:
          "YouTube channel ID (starts with UC...) OR channel handle (e.g. '@mrawan'). If handle is given, will be resolved to channel id.",
      },
      hours: {
        type: "number",
        description: "Time window in hours to check for new uploads. Default 24.",
        default: 24,
      },
      maxResults: {
        type: "number",
        description: "Maximum number of videos to return. Default 10.",
        default: 10,
      },
    },
    required: ["channelId"],
  },
  async execute(params) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "YOUTUBE_API_KEY env var غير مضبوط. ضع مفتاح YouTube Data API v3.",
      };
    }

    const input = String(params.channelId || "").trim();
    if (!input) {
      return { success: false, error: "channelId مطلوبة" };
    }

    const hours = Math.max(1, Math.min(168, Number(params.hours) || 24));
    const maxResults = Math.max(1, Math.min(50, Number(params.maxResults) || 10));
    const since = new Date(Date.now() - hours * 3600 * 1000);

    try {
      // 1) حل الـ channel ID من handle لو لزم
      let channelId = input;
      if (input.startsWith("@") || !input.startsWith("UC")) {
        const handle = input.startsWith("@") ? input.slice(1) : input;
        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`,
          { signal: AbortSignal.timeout(15_000) },
        );
        const searchData = await searchRes.json();
        const found = searchData?.items?.[0]?.id;
        if (!found) {
          return { success: false, error: `مش عارف أحل channel ID من: ${input}` };
        }
        channelId = found;
      }

      // 2) ناخد uploads playlist id
      const chanRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${channelId}&key=${apiKey}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      const chanData = await chanRes.json();
      const channel = chanData?.items?.[0];
      if (!channel) {
        return { success: false, error: `قناة غير موجودة: ${channelId}` };
      }
      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        return { success: false, error: "تعذّر الحصول على قائمة الرفع للقناة" };
      }
      const channelTitle = channel.snippet?.title || channelId;

      // 3) نقرأ آخر فيديوهات من uploads playlist
      const videos: YouTubeVideoItem[] = [];
      let pageToken = "";
      let fetched = 0;
      const cap = Math.min(maxResults * 3, 50);

      while (fetched < cap) {
        const url =
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}` +
          `&maxResults=${Math.min(50, cap - fetched)}&key=${apiKey}` +
          (pageToken ? `&pageToken=${pageToken}` : "");
        const plRes = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const plData = await plRes.json();
        if (!plData?.items?.length) break;

        for (const item of plData.items) {
          const snip = item.snippet;
          if (!snip?.resourceId?.videoId) continue;
          const publishedAt = new Date(snip.publishedAt);
          videos.push({
            videoId: snip.resourceId.videoId,
            title: snip.title || "(no title)",
            publishedAt: snip.publishedAt,
            thumbnail:
              snip.thumbnails?.medium?.url ||
              snip.thumbnails?.default?.url ||
              `https://img.youtube.com/vi/${snip.resourceId.videoId}/default.jpg`,
            url: `https://www.youtube.com/watch?v=${snip.resourceId.videoId}`,
          });
          fetched++;
          if (fetched >= cap) break;
        }
        pageToken = plData?.nextPageToken || "";
        if (!pageToken) break;
      }

      // 4) فلترة آخر `hours` ساعة
      const newVideos = videos.filter((v) => new Date(v.publishedAt) >= since).slice(0, maxResults);

      return {
        success: true,
        data: {
          channelId,
          channelTitle,
          hours,
          since: since.toISOString(),
          newCount: newVideos.length,
          recentChecked: videos.length,
          newVideos,
        },
      };
    } catch (e: any) {
      return { success: false, error: `YouTube API error: ${e.message}` };
    }
  },
};
