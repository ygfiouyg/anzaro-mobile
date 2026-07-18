/**
 * MCP Tool: Summarize
 * ====================
 * فكرة من: AI-powered YouTube Video Summarization
 * يلخص أي نص/فيديو/مقال
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";

export const summarizeTool: MCPTool = {
  name: "summarize",
  description: "لخص أي نص/مقال/محتوى. استخدمها لما المستخدم يقول 'لخص' أو 'summary' أو 'تلخيص'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص المراد تلخيصه" },
      length: { type: "string", description: "طول التلخيص: short, medium, long", enum: ["short", "medium", "long"], default: "medium" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const length = String(params.length || "medium");
    if (!text) return { success: false, error: "text مطلوب" };
    try {
      const zai = await getZAIClient();
      const lengthInstruction = length === "short" ? "3 جمل فقط" : length === "long" ? "5-10 فقرات" : "فقرة واحدة";
      const completion = await zai.chat.completions.create({
        model: "glm-5.2",
        messages: [
          { role: "system", content: `لخص النص التالي (${lengthInstruction}). اذكر النقاط الرئيسية. بالعربي.` },
          { role: "user", content: text.slice(0, 15000) },
        ],
        max_tokens: 2000, temperature: 0.3,
      });
      return { success: true, data: { summary: completion?.choices?.[0]?.message?.content || "", originalLength: text.length } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
