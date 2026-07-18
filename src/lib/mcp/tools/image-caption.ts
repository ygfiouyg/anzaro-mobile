/**
 * MCP Tool: Image Caption
 * ========================
 * فكرة من: Easy Image Captioning with Gemini
 * يصف صورة بـ GLM-4V
 */
import type { MCPTool } from "../types";

export const imageCaptionTool: MCPTool = {
  name: "image_caption",
  description: "وصف/تحليل صورة. استخدمها لما المستخدم يرفع صورة أو يطلب وصف صورة.",
  parameters: {
    type: "object",
    properties: {
      imageUrl: { type: "string", description: "رابط الصورة (URL)" },
      question: { type: "string", description: "سؤال محدد عن الصورة (اختياري)", default: "صف الصورة" },
    },
    required: ["imageUrl"],
  },
  async execute(params) {
    const imageUrl = String(params.imageUrl || "");
    const question = String(params.question || "صف الصورة");
    if (!imageUrl) return { success: false, error: "imageUrl مطلوب" };
    try {
      const { getZAIClient } = await import("@/lib/zai-client");
      const zai = await getZAIClient();
      const completion = await zai.chat.completions.create({
        model: "glm-4v",
        messages: [{ role: "user", content: [{ type: "text", text: question }, { type: "image_url", image_url: { url: imageUrl } }] }],
        max_tokens: 1000, temperature: 0.5,
      } as any);
      const caption = completion?.choices?.[0]?.message?.content || "";
      return { success: true, data: { caption, question, imageUrl } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
