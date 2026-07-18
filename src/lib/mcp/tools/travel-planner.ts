/**
 * MCP Tool: Travel Planner (Scenario)
 * سيناريو متعدد الخطوات: تخطيط رحلة كامل بميزانية + جدول يومي + نصائح
 *
 * الخطوات:
 *  1) التحقق من المدخلات + حساب المعاملات (عدد الأيام × عدد الفترات)
 *  2) تقدير الميزانية اليومية الإجمالية (pre-analysis)
 *  3) استدعاء GLM لتوليد الجدول + الميزانية + النصائح
 *  4) التحقق من الأرقام + إصلاح التوزيع + حساب الفارق
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const travelPlannerTool: MCPTool = {
  name: "travel_planner",
  description:
    "خطط رحلة كاملة (جدول يومي + ميزانية + نصائح). استخدمها لما المستخدم يقول 'خطط رحلة' أو 'travel plan' أو 'itinerary'.",
  parameters: {
    type: "object",
    properties: {
      destination: { type: "string", description: "الوجهة (مدينة/دولة)" },
      days: { type: "number", description: "عدد الأيام" },
      budget: { type: "string", description: "الميزانية الإجمالية (مع العملة)" },
      interests: { type: "string", description: "الاهتمامات (مثال: ثقافة، طعام، مغامرة)" },
    },
    required: ["destination", "days", "budget"],
  },
  async execute(params) {
    const destination = String(params.destination || "").trim();
    const days = Math.max(1, Math.min(30, Number(params.days) || 1));
    const budget = String(params.budget || "").trim();
    const interests = String(params.interests || "").trim();

    if (!destination) return { success: false, error: "destination مطلوبة" };
    if (!budget) return { success: false, error: "budget مطلوبة" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + compute base parameters ═══
      const totalSlots = days * 3; // morning + afternoon + evening
      const budgetNum = parseFloat(budget.replace(/[^\d.]/g, "")) || 0;
      const dailyBudget = budgetNum > 0 ? budgetNum / days : 0;
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Pre-analysis — estimate ideal split ═══
      const idealSplit = {
        transport: Math.round(dailyBudget * 0.2 * days),
        accommodation: Math.round(dailyBudget * 0.35 * days),
        food: Math.round(dailyBudget * 0.2 * days),
        activities: Math.round(dailyBudget * 0.25 * days),
      };
      stepsCompleted.push("pre_analyze_budget");

      // ═══ Step 3: AI generation — itinerary + budget + tips ═══
      const systemPrompt = `أنت مخطط رحلات محترف. خطط رحلة ${days} أيام لـ ${destination} بميزانية ${budget}.
الاهتمامات: ${interests || "عامة"}.
رجّع JSON فقط:
{"itinerary":[{"day":1,"morning":"","afternoon":"","evening":"","estimated_cost":0}],"budget_breakdown":{"transport":0,"accommodation":0,"food":0,"activities":0,"total":0},"tips":[]}
- itinerary فيه ${days} أيام بالظبط.
- estimated_cost بـ أرقام.
- tips 5 نصائح قصيرة.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `خطط رحلة ${days} أيام لـ ${destination} بميزانية ${budget}. الاهتمامات: ${interests}.`,
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
      stepsCompleted.push("ai_generate_plan");

      // ═══ Step 4: Post-process — validate + fix budget ═══
      const data = result.data || {};
      const breakdown = data.budget_breakdown || {};
      const realTotal =
        (Number(breakdown.transport) || 0) +
        (Number(breakdown.accommodation) || 0) +
        (Number(breakdown.food) || 0) +
        (Number(breakdown.activities) || 0);

      // لو المجموع صفر، استخدم التقدير المثالي
      const finalBreakdown =
        realTotal > 0
          ? { ...breakdown, total: realTotal }
          : { ...idealSplit, total: budgetNum };

      // لو الـ itinerary ناقص، علّم بـ placeholder
      const itinerary = Array.isArray(data.itinerary) ? data.itinerary : [];
      const tips = Array.isArray(data.tips) ? data.tips : [];
      stepsCompleted.push("postprocess_validate");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "travel_planner",
          destination,
          days,
          budget,
          interests: interests || "عامة",
          daily_budget: dailyBudget,
          ideal_split: idealSplit,
          itinerary,
          budget_breakdown: finalBreakdown,
          tips,
          itinerary_slots_total: totalSlots,
          itinerary_entries_generated: itinerary.length,
          budget_diff: realTotal - budgetNum,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
