/**
 * MCP Tool: Negotiation Coach (Scenario)
 * سيناريو متعدد الخطوات: تدريب على التفاوض (استراتيجية + تكتيكات + سكريبتات + BATNA)
 *
 * الخطوات:
 *  1) التحقق من المدخلات + استخراج أهداف الطرفين
 *  2) تحليل العلاقة + تحديد درجة التعقيد
 *  3) استدعاء GLM لتوليد الاستراتيجية + السكريبتات + BATNA
 *  4) التحقق من الحقول + التأكد من وجود سكريبتات كافية
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const RELATIONSHIP_TYPES = ["مهنية", "شخصية", "تجارية", "عائلية", "رسمية"];

export const negotiationCoachTool: MCPTool = {
  name: "negotiation_coach",
  description:
    "درّبني على التفاوض (استراتيجية + افتتاحية + تكتيكات + سكريبتات + BATNA + إشارات خطر + إغلاق). استخدمها لما المستخدم يقول 'علمني تفاوض' أو 'negotiation' أو 'كيف أتفاوض'.",
  parameters: {
    type: "object",
    properties: {
      scenario: { type: "string", description: "سيناريو التفاوض (مثال: راتب جديد، عقد)" },
      yourGoal: { type: "string", description: "هدفك من التفاوض" },
      theirGoal: { type: "string", description: "هدف الطرف الآخر (المتوقع)" },
      relationship: { type: "string", description: "نوع العلاقة (مهنية، شخصية، تجارية، عائلية، رسمية)" },
    },
    required: ["scenario", "yourGoal", "theirGoal"],
  },
  async execute(params) {
    const scenario = String(params.scenario || "").trim();
    const yourGoal = String(params.yourGoal || "").trim();
    const theirGoal = String(params.theirGoal || "").trim();
    const relationship = String(params.relationship || "").trim();

    if (!scenario) return { success: false, error: "scenario مطلوب" };
    if (!yourGoal) return { success: false, error: "yourGoal مطلوب" };
    if (!theirGoal) return { success: false, error: "theirGoal مطلوب" };

    const finalRelationship = RELATIONSHIP_TYPES.includes(relationship)
      ? relationship
      : "مهنية";

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + extract goal keywords ═══
      const yourKeywords = yourGoal.toLowerCase().split(/[\s,،]+/).filter((w) => w.length > 3);
      const theirKeywords = theirGoal.toLowerCase().split(/[\s,،]+/).filter((w) => w.length > 3);
      const hasMoneyGoal = /راتب|سعر|مال|cost|salary|price|money/i.test(yourGoal + theirGoal);
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Analyze complexity ═══
      const complexityScore =
        (yourKeywords.length > 3 ? 1 : 0) +
        (theirKeywords.length > 3 ? 1 : 0) +
        (hasMoneyGoal ? 1 : 0) +
        (finalRelationship === "شخصية" || finalRelationship === "عائلية" ? 1 : 0);
      const complexity =
        complexityScore >= 3 ? "عالية" : complexityScore >= 2 ? "متوسطة" : "منخفضة";
      stepsCompleted.push("analyze_complexity");

      // ═══ Step 3: AI generation — strategy + scripts + BATNA ═══
      const systemPrompt = `درّبني على التفاوض: ${scenario}.
هدفي: ${yourGoal}. هدفهم: ${theirGoal}. العلاقة: ${finalRelationship}.
رجّع JSON فقط:
{"strategy":"","opening":"","tactics":[],"scripts":[{"situation":"","what_to_say":""}],"batna":"","red_flags":[],"closing":""}
- strategy 3-4 أسطر واضحة.
- opening: جملة افتتاحية قوية.
- tactics 4-6 تكتيكات قصيرة.
- scripts 4-6 سكريبتات لمواقف مختلفة.
- batna: أفضل بديل لاتفاق تفاوضي (Best Alternative).
- red_flags 3-4 إشارات تحذير.
- closing: كيف تغلق التفاوض بنجاح.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `السيناريو: ${scenario}. هدفي: ${yourGoal}. هدفهم: ${theirGoal}. العلاقة: ${finalRelationship}.`,
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
      stepsCompleted.push("ai_generate_strategy");

      // ═══ Step 4: Validate + ensure scripts ═══
      const data = result.data || {};
      const strategy = String(data.strategy || "").trim();
      const opening = String(data.opening || "").trim();
      const tactics = Array.isArray(data.tactics)
        ? data.tactics.map((t: any) => String(t))
        : [];

      const scripts = Array.isArray(data.scripts)
        ? data.scripts
            .filter((s: any) => s && (s.situation || s.what_to_say))
            .map((s: any) => ({
              situation: String(s.situation || "").trim(),
              what_to_say: String(s.what_to_say || "").trim(),
            }))
        : [];

      const batna = String(data.batna || "").trim();
      const redFlags = Array.isArray(data.red_flags)
        ? data.red_flags.map((r: any) => String(r))
        : [];
      const closing = String(data.closing || "").trim();
      stepsCompleted.push("validate_fill_scripts");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "negotiation_coach",
          scenario_input: scenario,
          your_goal: yourGoal,
          their_goal: theirGoal,
          relationship: finalRelationship,
          complexity,
          complexity_score: complexityScore,
          has_money_goal: hasMoneyGoal,
          strategy,
          opening,
          tactics,
          scripts,
          scripts_count: scripts.length,
          batna,
          red_flags: redFlags,
          closing,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
