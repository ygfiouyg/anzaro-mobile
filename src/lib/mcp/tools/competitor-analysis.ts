/**
 * MCP Tool: Competitor Analysis (Scenario)
 * سيناريو متعدد الخطوات: مقارنة منافسين + SWOT + استراتيجية + positioning
 *
 * الخطوات:
 *  1) التحقق + تقسيم أسماء المنافسين
 *  2) Pre-template: لكل منافس، هيكل strengths/weaknesses فاضي
 *  3) استدعاء GLM للمقارنة + SWOT + الاستراتيجية
 *  4) التحقق من وجود كل المنافسين في النتائج + إكمال الناقص
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const competitorAnalysisTool: MCPTool = {
  name: "competitor_analysis",
  description:
    "حلل منافسين + SWOT + استراتيجية + positioning. استخدمها لما المستخدم يقول 'حلل المنافسين' أو 'competitor analysis' أو 'قارن بيناتنا'.",
  parameters: {
    type: "object",
    properties: {
      competitors: {
        type: "string",
        description: "أسماء المنافسين (مفصولة بفواصل)",
      },
      yourProduct: { type: "string", description: "اسم/وصف منتجك" },
    },
    required: ["competitors", "yourProduct"],
  },
  async execute(params) {
    const competitorsInput = String(params.competitors || "").trim();
    const yourProduct = String(params.yourProduct || "").trim();
    if (!competitorsInput) return { success: false, error: "competitors مطلوبة" };
    if (!yourProduct) return { success: false, error: "yourProduct مطلوب" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + split competitors ═══
      const competitorNames = competitorsInput
        .split(/[,،\n;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 6); // حد أقصى 6 منافسين

      if (competitorNames.length === 0) {
        return { success: false, error: "ما في منافسين صالحين" };
      }
      stepsCompleted.push("parse_competitors");

      // ═══ Step 2: Pre-template — empty structure per competitor ═══
      const template = competitorNames.map((name) => ({
        competitor: name,
        strengths: [] as string[],
        weaknesses: [] as string[],
      }));
      stepsCompleted.push("init_template");

      // ═══ Step 3: AI generation — comparison + SWOT + strategy ═══
      const systemPrompt = `حلل المنافسين دول: ${competitorNames.join("، ")} مقابل منتجنا: ${yourProduct}.
رجّع JSON فقط:
{"comparison":[{"competitor":"","strengths":[],"weaknesses":[]}],"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"strategy":"","positioning":""}
- comparison: لكل منافس 3-4 نقاط قوة وضعف.
- swot: 3-4 نقاط لكل عنصر (لمنتجنا).
- strategy: 3-4 أسطر.
- positioning: جملة positioning المقترحة.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `المنافسين: ${competitorNames.join("، ")}. منتجنا: ${yourProduct}.`,
        maxTokens: 2500,
        temperature: 0.5,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_analyze");

      // ═══ Step 4: Validate + fill missing competitors ═══
      const data = result.data || {};
      const aiComparison = Array.isArray(data.comparison) ? data.comparison : [];

      // دمج: نتائج الـ AI + إكمال المنافسين الناقصين
      const aiNames = new Set(
        aiComparison.map((c: any) => String(c.competitor || "").toLowerCase())
      );
      const mergedComparison = [
        ...aiComparison.map((c: any) => ({
          competitor: String(c.competitor || ""),
          strengths: Array.isArray(c.strengths)
            ? c.strengths.map((s: any) => String(s))
            : [],
          weaknesses: Array.isArray(c.weaknesses)
            ? c.weaknesses.map((w: any) => String(w))
            : [],
        })),
        ...template
          .filter((t) => !aiNames.has(t.competitor.toLowerCase()))
          .map((t) => ({
            competitor: t.competitor,
            strengths: ["(لم يتم التحليل)"] as string[],
            weaknesses: ["(لم يتم التحليل)"] as string[],
          })),
      ];

      const cleanList = (v: any): string[] =>
        Array.isArray(v) ? v.map((x: any) => String(x)).filter((s: string) => s.length > 0) : [];

      const swot = data.swot || {};
      const finalSwot = {
        strengths: cleanList(swot.strengths),
        weaknesses: cleanList(swot.weaknesses),
        opportunities: cleanList(swot.opportunities),
        threats: cleanList(swot.threats),
      };
      stepsCompleted.push("validate_merge");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "competitor_analysis",
          your_product: yourProduct,
          competitors_input: competitorNames,
          competitors_analyzed: mergedComparison.length,
          comparison: mergedComparison,
          swot: finalSwot,
          strategy: String(data.strategy || ""),
          positioning: String(data.positioning || ""),
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
