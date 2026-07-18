/**
 * MCP Tool: YouTube Trend Finder
 * ===============================
 * فكرة من: AI Youtube Trend Finder Based On Niche
 * يدور على ترندات يوتيوب لـ niche معين
 */

import type { MCPTool } from "../types";

export const youtubeTrendsTool: MCPTool = {
  name: "youtube_trends",
  description: "دور على ترندات يوتيوب لـ مجال معين. استخدمها لما المستخدم يقول 'ترندات' أو 'trends' أو 'أفكار فيديوهات'.",
  parameters: {
    type: "object",
    properties: {
      niche: {
        type: "string",
        description: "المجال/الـ niche (مثلاً: gaming, cooking, tech)",
      },
    },
    required: ["niche"],
  },
  async execute(params) {
    const niche = String(params.niche || "");
    if (!niche) return { success: false, error: "niche مطلوب" };

    const apiKey = process.env.YOUTUBE_API_KEY || "";
    if (!apiKey) {
      return { success: false, error: "YOUTUBE_API_KEY غير مضافة" };
    }

    try {
      // ابحث عن الفيديوهات الأكثر مشاهدة في الـ niche
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(niche)}&maxResults=10&order=viewCount&publishedAfter=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}&key=${apiKey}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) return { success: false, error: `YouTube API error: ${res.status}` };

      const data = await res.json();
      const trends = (data?.items || []).map((item: any) => ({
        title: item.snippet?.title || "",
        videoId: item.id?.videoId || "",
        url: `https://youtube.com/watch?v=${item.id?.videoId || ""}`,
        channel: item.snippet?.channelTitle || "",
        publishedAt: item.snippet?.publishedAt || "",
        thumbnail: item.snippet?.thumbnails?.medium?.url || "",
      }));

      return { success: true, data: { niche, trends, count: trends.length } };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
