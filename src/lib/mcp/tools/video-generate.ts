/**
 * MCP Tool — Video Generation
 * ===========================
 * توليد فيديو من نص (text-to-video) عبر CogVideoX-Flash / HF LTX-Video.
 */
import type { MCPTool } from "../types";
import { generateVideo } from "@/lib/ai-tools/media-tools";

export const videoGenerateTool: MCPTool = {
  name: "video_generate",
  description:
    "Generate a short video from a text prompt (text-to-video). Returns a task id and (eventually) a video URL. May take 30-150 seconds. If the result is async, returns a taskId to poll later.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "A description of the video to generate (e.g. 'a car driving through a futuristic city at night').",
      },
      duration: {
        type: "number",
        description: "Video duration in seconds. Supported values: 5 or 10.",
        default: 5,
      },
    },
    required: ["prompt"],
  },
  async execute(params) {
    const prompt = String(params.prompt || "").trim();
    const duration = (Number(params.duration) === 10 ? 10 : 5) as 5 | 10;

    if (!prompt) {
      return { success: false, error: "prompt مطلوبة" };
    }

    const result = await generateVideo(prompt, { duration, quality: "speed" });

    if (!result.success) {
      return { success: false, error: result.error || "فشل توليد الفيديو" };
    }

    return {
      success: true,
      data: {
        prompt,
        duration,
        taskId: result.taskId || "",
        status: result.status || "UNKNOWN",
        videoUrl: result.videoUrl || "",
        coverUrl: result.coverUrl || "",
      },
    };
  },
};
