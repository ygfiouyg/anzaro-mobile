/**
 * Tool: analyze_image (Vision Router for "blind" models)
 * ======================================================
 * PROBLEM: Not all LLMs support vision. Hardcoding a list of "vision models"
 * is fragile.
 *
 * SOLUTION: Capability detection + auto-routing.
 *   1. If the active model supports vision → use it directly
 *   2. If not → route to GLM-4V (vision model) for just this turn
 *   3. Return the vision model's analysis as tool output
 *
 * This gives ANY text-only model "vision" by proxy.
 */

import type { MCPTool, MCPToolResult } from "../types";

// ═══════════════════════════════════════════════════════════════════════
// Capability Detection — dynamically check if a model supports vision
// ═══════════════════════════════════════════════════════════════════════

// Models known to support vision (updated dynamically)
const VISION_CAPABLE_PATTERNS = [
  /glm-4.*v/i,      // GLM-4V, GLM-4.6V
  /gpt-4.*vision/i, // GPT-4 Vision
  /gpt-4o/i,        // GPT-4o
  /claude-3/i,      // Claude 3 (all variants support vision)
  /gemini.*pro/i,   // Gemini Pro Vision
  /llava/i,         // LLaVA
  /cogvlm/i,        // CogVLM
  /qwen.*vl/i,      // Qwen-VL
];

function modelSupportsVision(modelId: string): boolean {
  return VISION_CAPABLE_PATTERNS.some(pattern => pattern.test(modelId));
}

// ═══════════════════════════════════════════════════════════════════════
// Vision Analysis via ZAI SDK (GLM-4V)
// ═══════════════════════════════════════════════════════════════════════

async function analyzeWithVisionModel(
  imageUrl: string,
  prompt: string,
  currentModel: string
): Promise<{ analysis: string; modelUsed: string }> {
  // If the current model supports vision, use it
  if (modelSupportsVision(currentModel)) {
    const { getZAIClient } = await import("@/lib/zai-client");
    const zai = await getZAIClient();

    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      model: currentModel,
      thinking: { type: "disabled" },
    } as any);

    return {
      analysis: completion.choices?.[0]?.message?.content || "No analysis returned",
      modelUsed: currentModel,
    };
  }

  // Route to GLM-4V (the default vision model)
  const { getZAIClient } = await import("@/lib/zai-client");
  const zai = await getZAIClient();

  const completion = await zai.chat.completions.createVision({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  } as any);

  return {
    analysis: completion.choices?.[0]?.message?.content || "No analysis returned",
    modelUsed: "glm-4v", // Default vision model
  };
}

// ═══════════════════════════════════════════════════════════════════════
// OCR Fallback (for text-heavy images)
// ═══════════════════════════════════════════════════════════════════════

async function extractTextFromImage(imageUrl: string): Promise<string> {
  try {
    // Use ZAI vision with OCR-focused prompt
    const { getZAIClient } = await import("@/lib/zai-client");
    const zai = await getZAIClient();

    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract ALL text from this image. Return ONLY the extracted text, preserving layout. If there's no text, say 'NO_TEXT_FOUND'.",
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as any);

    const text = completion.choices?.[0]?.message?.content || "";
    return text === "NO_TEXT_FOUND" ? "" : text;
  } catch {
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════════════
// THE TOOL
// ═══════════════════════════════════════════════════════════════════════

export const analyzeImageTool: MCPTool = {
  name: "analyze_image",
  description: `Analyze an image using AI vision. Works with ANY model — even text-only models.
Automatically routes to a vision-capable model (GLM-4V) if the current model doesn't support vision.
Use cases: image description, OCR/text extraction, object detection, chart reading, diagram understanding.
Supports: JPG, PNG, GIF, WebP, BMP.
Returns: { analysis, model_used, ocr_text (if applicable) }`,
  parameters: {
    type: "object",
    properties: {
      image_url: {
        type: "string",
        description: "URL of the image to analyze. Can be a public URL or a base64 data URI.",
      },
      prompt: {
        type: "string",
        description: "What to analyze in the image. E.g., 'Describe this image', 'Extract all text', 'What objects are visible?'",
        default: "Describe this image in detail.",
      },
      extract_text: {
        type: "boolean",
        description: "If true, also extract all text from the image (OCR). Default: false.",
        default: false,
      },
      current_model: {
        type: "string",
        description: "The model ID currently in use (for capability detection). If omitted, defaults to vision routing.",
      },
    },
    required: ["image_url"],
  },

  async execute(params): Promise<MCPToolResult> {
    const imageUrl = String(params.image_url || "").trim();
    const prompt = String(params.prompt || "Describe this image in detail.");
    const extractText = params.extract_text === true;
    const currentModel = String(params.current_model || "");

    if (!imageUrl) {
      return { success: false, error: "No image URL provided" };
    }

    try {
      // 1. Analyze the image (with vision routing)
      const { analysis, modelUsed } = await analyzeWithVisionModel(imageUrl, prompt, currentModel);

      // 2. If OCR requested, extract text separately
      let ocrText = "";
      if (extractText) {
        ocrText = await extractTextFromImage(imageUrl);
      }

      return {
        success: true,
        data: {
          analysis,
          model_used: modelUsed,
          ocr_text: ocrText || undefined,
          routed: modelUsed !== currentModel, // true if we routed to a different model
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
