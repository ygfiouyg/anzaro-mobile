/**
 * MCP Tool: Review Analysis (من Trustpilot أو أي مصدر)
 * سيناريو: حلل مراجعات → sentiment → تقرير
 * 
 * إصلاح: بدل ما نحاول scrape Trustpilot (مستحيل — JS rendered)،
 * اقبل نص المراجعات كـ input مباشر. هذا أعم وأكثر فائدة.
 * 
 * n8n template: "Scrape Trustpilot Reviews with DeepSeek, Analyze Sentiment with OpenAI"
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const trustpilotAnalysisTool: MCPTool = {
  name: "trustpilot_review_analysis",
  description: "حلل مراجعات عملاء — sentiment + pros/cons + تقرير (سيناريو متكامل). استخدمها لما المستخدم يقول 'حلل مراجعات' أو 'تقييمات عملاء'. اقبل نص المراجعات مباشر.",
  parameters: {
    type: "object",
    properties: {
      reviews: { type: "string", description: "نص المراجعات (كل مراجعة في سطر أو مفصولة بـ ---)" },
      companyName: { type: "string", description: "اسم الشركة (اختياري)", default: "" },
    },
    required: ["reviews"],
  },
  async execute(params) {
    const reviewsText = String(params.reviews || "").trim();
    const companyName = String(params.companyName || "").trim();
    if (!reviewsText) return { success: false, error: "reviews مطلوبة — مرر نص المراجعات" };

    try {
      // ═══ الخطوة 1: قسّم المراجعات ═══
      let reviews: string[];
      if (reviewsText.includes("---")) {
        reviews = reviewsText.split(/\n?---\n?/).map((r) => r.trim()).filter(Boolean);
      } else {
        reviews = reviewsText.split(/\n/).map((r) => r.trim()).filter((r) => r.length > 10);
      }

      if (reviews.length === 0) return { success: false, error: "مفيش مراجعات صالحة" };

      // ═══ الخطوة 2: تحليل المشاعر ═══
      const analysis = await callGLMForJSON({
        systemPrompt: `أنت محلل مراجعات محترف. حلل ${reviews.length} مراجعة${companyName ? ` لـ "${companyName}"` : ""}.

لكل مراجعة: صنفها (positive/negative/neutral) + score 0-100.

ثم ولّد تقرير:
- positive_count, negative_count, neutral_count
- pros: أهم 3-5 نقاط قوة
- cons: أهم 3-5 نقاط ضعف  
- summary: ملخص 2-3 أسطر
- recommendation: توصية للشركة

رجّع JSON:
{
  "reviews_analyzed": [{"text":"ملخص المراجعة","sentiment":"positive","score":85}],
  "report": {
    "total": 0,
    "positive_count": 0,
    "negative_count": 0,
    "neutral_count": 0,
    "pros": [],
    "cons": [],
    "summary": "",
    "recommendation": ""
  }
}`,
        userMessage: reviews.map((r, i) => `مراجعة ${i + 1}: ${r}`).join("\n\n").slice(0, 4000),
        maxTokens: 2000,
        temperature: 0.3,
      });

      const report = analysis.data?.report || {};
      const analyzed = analysis.data?.reviews_analyzed || [];

      return {
        success: true,
        data: {
          scenario: "trustpilot_review_analysis",
          company: companyName || "غير محدد",
          reviews_count: reviews.length,
          steps: {
            parse: true,
            analyze: analyzed.length > 0,
            report: !!report.summary,
          },
          analysis: {
            sentiment: {
              positive: report.positive_count || 0,
              negative: report.negative_count || 0,
              neutral: report.neutral_count || 0,
            },
            pros: report.pros || [],
            cons: report.cons || [],
            summary: report.summary || "",
            recommendation: report.recommendation || "",
          },
          sample_reviews: analyzed.slice(0, 5),
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
