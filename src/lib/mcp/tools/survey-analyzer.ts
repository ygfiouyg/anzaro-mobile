/**
 * MCP Tool: Survey Analyzer (Scenario)
 * سيناريو متعدد الخطوات: تحليل إجابات استبيان + رضا + ثيمات + توصيات
 *
 * الخطوات:
 *  1) التحقق من المدخلات + تقسيم الإجابات
 *  2) Pre-scan: عدّ الإجابات + كشف مشاعر بسيط (كلمات إيجابية/سلبية)
 *  3) استدعاء GLM لتحليل الترندات + رضا + ثيمات
 *  4) التحقق من satisfaction_score + تنظيف القوائم
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const POSITIVE_KEYWORDS = [
  "ممتاز",
  "جيد",
  "رائع",
  "أحب",
  "اجابي",
  "إيجابي",
  "سعيد",
  "good",
  "great",
  "excellent",
  "love",
  "happy",
  "satisfied",
];
const NEGATIVE_KEYWORDS = [
  "سيء",
  "ضعيف",
  "كرهت",
  "مشكلة",
  "سلبي",
  "حزين",
  "غاضب",
  "bad",
  "poor",
  "hate",
  "sad",
  "angry",
  "terrible",
];

export const surveyAnalyzerTool: MCPTool = {
  name: "survey_analyzer",
  description:
    "حلل إجابات استبيان + رضا + ثيمات + توصيات. استخدمها لما المستخدم يقول 'حلل الاستبيان' أو 'survey analysis' أو 'إجابات العملاء'.",
  parameters: {
    type: "object",
    properties: {
      responses: {
        type: "string",
        description: "إجابات الاستبيان (سطر لكل إجابة أو مفصولة بفواصل)",
      },
      context: { type: "string", description: "سياق الاستبيان (موضوع/منتج) (اختياري)" },
    },
    required: ["responses"],
  },
  async execute(params) {
    const responsesInput = String(params.responses || "").trim();
    const context = String(params.context || "").trim();
    if (!responsesInput || responsesInput.length < 30) {
      return { success: false, error: "responses مطلوبة (30 حرف على الأقل)" };
    }

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + split responses ═══
      const responses = responsesInput
        .split(/[\n]+|(?<=[.؟!?])\s+(?=[A-Z\u0600-\u06FF])/)
        .map((r) => r.trim())
        .filter((r) => r.length > 5);

      if (responses.length === 0) {
        return { success: false, error: "ما في إجابات صالحة" };
      }
      stepsCompleted.push("split_responses");

      // ═══ Step 2: Pre-scan sentiment keywords ═══
      let positiveHits = 0;
      let negativeHits = 0;
      for (const r of responses) {
        const lower = r.toLowerCase();
        if (POSITIVE_KEYWORDS.some((k) => lower.includes(k))) positiveHits++;
        if (NEGATIVE_KEYWORDS.some((k) => lower.includes(k))) negativeHits++;
      }
      const totalSentimentHits = positiveHits + negativeHits;
      const positiveRatio = totalSentimentHits > 0 ? positiveHits / totalSentimentHits : 0.5;
      stepsCompleted.push("pre_scan_sentiment");

      // ═══ Step 3: AI generation — analyze trends + satisfaction ═══
      const systemPrompt = `حلل إجابات الاستبيان دي.
${context ? `السياق: ${context}.` : ""}
رجّع JSON فقط:
{"satisfaction_score":0,"key_themes":[],"positive_points":[],"negative_points":[],"demographics_insights":"","recommendations":[]}
- satisfaction_score من 0 لـ 100.
- key_themes 3-5 ثيمات.
- positive_points + negative_points 3-5 لكل واحد.
- recommendations 3-5 توصيات.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: responsesInput.slice(0, 5000),
        maxTokens: 2000,
        temperature: 0.4,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_analyze_survey");

      // ═══ Step 4: Validate satisfaction + clean lists ═══
      const data = result.data || {};
      const satisfaction = Math.max(0, Math.min(100, Number(data.satisfaction_score) || 0));

      const cleanList = (v: any): string[] =>
        Array.isArray(v) ? v.map((x: any) => String(x)).filter((s: string) => s.length > 0) : [];

      const keyThemes = cleanList(data.key_themes);
      const positivePoints = cleanList(data.positive_points);
      const negativePoints = cleanList(data.negative_points);
      const recommendations = cleanList(data.recommendations);
      stepsCompleted.push("validate_normalize");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "survey_analyzer",
          context: context || "غير محدد",
          responses_count: responses.length,
          pre_scan: {
            positive_hits: positiveHits,
            negative_hits: negativeHits,
            positive_ratio: Math.round(positiveRatio * 100),
          },
          satisfaction_score: satisfaction,
          key_themes: keyThemes,
          positive_points: positivePoints,
          negative_points: negativePoints,
          demographics_insights: String(data.demographics_insights || ""),
          recommendations,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
