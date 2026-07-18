/**
 * MCP Tool: Sentiment Analysis
 * =============================
 * فكرة من: AI Customer feedback sentiment analysis
 * يحلل مشاعر/آراء نص معين
 */

import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const sentimentAnalysisTool: MCPTool = {
  name: "sentiment_analysis",
  description: "حلل مشاعر/آراء نص معين (إيجابي/سلبي/محايد). استخدمها لمراجعات العملاء أو التعليقات.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "النص المراد تحليله",
      },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    if (!text) return { success: false, error: "text مطلوب" };

    try {
      const result = await callGLMForJSON({
        systemPrompt: `حلل مشاعر النص التالي وأرجع JSON:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": 0-100,
  "emotions": ["فرح", "غضب", ...],
  "summary": "ملخص قصير",
  "keywords": ["كلمة1", "كلمة2"]
}

حلل بالعربي. رجّع JSON فقط.`,
        userMessage: text,
        maxTokens: 1000,
        temperature: 0.3,
      });

      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
