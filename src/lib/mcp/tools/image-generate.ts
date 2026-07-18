/**
 * MCP Tool — Image Generation
 * ===========================
 * توليد صورة من نص (text-to-image) عبر CogView-3-Flash / Pollinations / HF SDXL.
 */
import type { MCPTool } from "../types";
import { generateImage } from "@/lib/ai-tools/media-tools";

export const imageGenerateTool: MCPTool = {
  name: "image_generate",
  description:
    "Generate an image from a text prompt. Returns a URL (and optional base64 data URI). Supported sizes: '1024x1024' (default), '768x768', '1280x720', etc.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "A description of the image to generate (e.g. 'a cat astronaut on mars').",
      },
      size: {
        type: "string",
        description: "Image dimensions as WIDTHxHEIGHT. Default '1024x1024'.",
        default: "1024x1024",
      },
    },
    required: ["prompt"],
  },
  async execute(params) {
    const prompt = String(params.prompt || "").trim();
    const size = String(params.size || "1024x1024").trim();

    if (!prompt) {
      return { success: false, error: "prompt مطلوبة" };
    }

    const result = await generateImage(prompt, size);

    if (!result.success) {
      return { success: false, error: result.error || "فشل توليد الصورة" };
    }

    return {
      success: true,
      data: {
        prompt,
        size,
        imageUrl: result.imageUrl || "",
        base64: result.base64 || "",
      },
    };
  },
};
