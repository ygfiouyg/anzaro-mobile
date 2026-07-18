/**
 * MCP Tool: Review Summarizer
 * فكرة من: "Scrape Trustpilot Reviews" + "AI Customer feedback sentiment analysis"
 * بيحلّل ويلخّص مراجعات عملاء.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const reviewSummarizerTool: MCPTool = {
  name: "review_summarizer",
  description: "حلّل ولخّص مراجعات عملاء. استخدمها لما المستخدم يقول 'مراجعات' أو 'reviews' أو 'تقييمات' أو 'feedback'.",
  parameters: {
    type: "object",
    properties: {
      reviews: { type: "string", description: "نص المراجعات (كل مراجعة في سطر)" },
      product: { type: "string", description: "اسم المنتج (اختياري)" },
    },
    required: ["reviews"],
  },
  async execute(params) {
    const reviews = String(params.reviews || "");
    const product = String(params.product || "");
    if (!reviews) return { success: false, error: "reviews مطلوبة" };
    if (reviews.length > 12000) return { success: false, error: "النص طويل جداً (حد 12000 حرف)" };
    try {
      const systemMsg = `أنت محلل مراجعات محترف. حلّل المراجعات دي${product ? ` لـ "${product}"` : ""}:

"""
${reviews.slice(0, 8000)}
"""

اعمل:
1. متوسط التقييم التقديري (0-5)
2. توزيع المشاعر (إيجابي/محايد/سلبي بالنسبة المئوية)
3. أهم 5 نقاط إيجابية (themes متكررة)
4. أهم 5 نقاط سلبية (شكاوى متكررة)
5. ملخص تنفيذي (3-4 أسطر)
6. توصيات للمنتج/الشركة بناءً على المراجعات

رجّع JSON فقط:
{"estimated_rating":0,"sentiment_distribution":{"positive":0,"neutral":0,"negative":0},"pros":[],"cons":[],"executive_summary":"","recommendations":[],"total_reviews_analyzed":0}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: reviews.slice(0, 1000),
        maxTokens: 4000,
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
