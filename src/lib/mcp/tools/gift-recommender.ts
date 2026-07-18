/**
 * MCP Tool: Gift Recommender (Scenario)
 * سيناريو متعدد الخطوات: اقتراح هدايا مرتبة + أفكار بديلة + نصائح شراء
 *
 * الخطوات:
 *  1) التحقق من المدخلات + استخراج رقم الميزانية
 *  2) تصنيف الميزانية (low/mid/high) + استخراج المناسبة
 *  3) استدعاء GLM لتوليد قائمة الهدايا + الأفكار البديلة + النصائح
 *  4) ترتيب التوصيات حسب rating + التحقق من الميزانية
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const giftRecommenderTool: MCPTool = {
  name: "gift_recommender",
  description:
    "اقترح هدايا مناسبة (مرتبة + سبب + سعر + مكان الشراء + تقييم). استخدمها لما المستخدم يقول 'اقترح هدية' أو 'gift ideas' أو 'هدايا لـ'.",
  parameters: {
    type: "object",
    properties: {
      recipient: { type: "string", description: "المستلم (مثال: أمي، صديقي، مديري)" },
      occasion: { type: "string", description: "المناسبة (مثال: عيد ميلاد، زواج، تخرج)" },
      budget: { type: "string", description: "الميزانية (مثال: 500 جنيه، $50)" },
      interests: { type: "string", description: "اهتمامات المستلم (مثال: قراءة، رياضة، تقنية)" },
    },
    required: ["recipient", "occasion"],
  },
  async execute(params) {
    const recipient = String(params.recipient || "").trim();
    const occasion = String(params.occasion || "").trim();
    const budget = String(params.budget || "").trim();
    const interests = String(params.interests || "").trim();

    if (!recipient) return { success: false, error: "recipient مطلوب" };
    if (!occasion) return { success: false, error: "occasion مطلوب" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + extract budget number ═══
      const budgetNum = parseFloat(budget.replace(/[^\d.]/g, "")) || 0;
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Classify budget tier ═══
      let budgetTier = "غير محدد";
      if (budgetNum > 0) {
        if (budgetNum < 50) budgetTier = "اقتصادي";
        else if (budgetNum < 200) budgetTier = "متوسط";
        else if (budgetNum < 1000) budgetTier = "مرتفع";
        else budgetTier = "فاخر";
      }
      stepsCompleted.push("classify_budget");

      // ═══ Step 3: AI generation — recommendations ═══
      const systemPrompt = `اقترح هدايا لـ ${recipient} مناسبة ${occasion} بميزانية ${budget || "غير محددة"}.
اهتمامات: ${interests || "عامة"}.
رجّع JSON فقط:
{"recommendations":[{"name":"","price_range":"","why":"","where_to_buy":"","rating":0}],"backup_ideas":[],"tips":""}
- recommendations 5-7 اقتراحات.
- rating من 1 لـ 5 (رقم).
- price_range مناسب للميزانية.
- where_to_buy: متاجر أو أونلاين.
- backup_ideas 3-4 أفكار إضافية قصيرة.
- tips 2-3 نصائح لاختيار الهدية.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `المستلم: ${recipient}. المناسبة: ${occasion}. الميزانية: ${budget}. الاهتمامات: ${interests}.`,
        maxTokens: 2500,
        temperature: 0.6,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_generate_recommendations");

      // ═══ Step 4: Sort by rating + validate ═══
      const data = result.data || {};
      let recommendations = Array.isArray(data.recommendations)
        ? data.recommendations
            .filter((r: any) => r && r.name)
            .map((r: any) => ({
              name: String(r.name).trim(),
              price_range: String(r.price_range || "").trim(),
              why: String(r.why || "").trim(),
              where_to_buy: String(r.where_to_buy || "").trim(),
              rating: Math.max(1, Math.min(5, Number(r.rating) || 3)),
            }))
        : [];

      // رتّب حسب rating تنازلياً
      recommendations.sort((a: any, b: any) => b.rating - a.rating);

      const backupIdeas = Array.isArray(data.backup_ideas)
        ? data.backup_ideas.map((b: any) => String(b))
        : [];
      const tips = String(data.tips || "").trim();
      stepsCompleted.push("sort_validate_recommendations");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "gift_recommender",
          recipient,
          occasion,
          budget,
          budget_number: budgetNum,
          budget_tier: budgetTier,
          interests: interests || "عامة",
          recommendations,
          recommendations_count: recommendations.length,
          top_recommendation: recommendations[0] || null,
          backup_ideas: backupIdeas,
          tips,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
