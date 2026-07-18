/**
 * MCP Tool — YouTube Video Analyzer
 * =================================
 * تحليل فيديو يوتيوب: استخراج title, author, transcript + تحليل بالـ GLM.
 */
import type { MCPTool } from "../types";
import { analyzeYouTubeVideo } from "@/lib/integrations/youtube-service";

export const youtubeAnalyzeTool: MCPTool = {
  name: "youtube_analyze",
  description:
    "Analyze a YouTube video: extract title, author, description, transcript, and answer a question about its content. Pass the YouTube URL and an optional question.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The YouTube video URL (e.g. 'https://www.youtube.com/watch?v=XXXX' or 'https://youtu.be/XXXX').",
      },
      question: {
        type: "string",
        description: "An optional question about the video content (e.g. 'What is the main topic?'). If omitted, returns a summary.",
      },
    },
    required: ["url"],
  },
  async execute(params) {
    const url = String(params.url || "").trim();
    const question = params.question ? String(params.question).trim() : undefined;

    if (!url) {
      return { success: false, error: "url مطلوبة" };
    }

    const result = await analyzeYouTubeVideo(url, question);

    if (!result.success) {
      return { success: false, error: result.error || "فشل تحليل الفيديو" };
    }

    return {
      success: true,
      data: {
        url,
        question: question || null,
        videoInfo: result.videoInfo,
        transcript: result.transcript ? String(result.transcript).slice(0, 4000) : "",
        analysis: result.analysis || "",
      },
    };
  },
};
