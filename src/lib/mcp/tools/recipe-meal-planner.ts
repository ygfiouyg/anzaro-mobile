/**
 * MCP Tool: Recipe Meal Planner (Scenario)
 * سيناريو متعدد الخطوات: تخطيط وجبات كامل + قائمة تسوق + نصائح تحضير
 *
 * الخطوات:
 *  1) التحقق من المدخلات + استخراج diet/allergies
 *  2) حساب حجم القائمة المتوقعة (days × people × 3-4 وجبات)
 *  3) استدعاء GLM لتوليد الوجبات اليومية + قائمة التسوق + نصائح التحضير
 *  4) التحقق من عدد الأيام + إكمال الناقص + تصنيف قائمة التسوق
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const SHOPPING_CATEGORIES = [
  "خضروات",
  "فواكه",
  "لحوم",
  "أسماك",
  "ألبان",
  "حبوب",
  "توابل",
  "مشروبات",
  "أخرى",
];

export const recipeMealPlannerTool: MCPTool = {
  name: "recipe_meal_planner",
  description:
    "خطط وجبات كاملة (فطار/غداء/عشاء + قائمة تسوق + نصائح تحضير). استخدمها لما المستخدم يقول 'خطط وجبات' أو 'meal plan' أو 'قائمة طعام'.",
  parameters: {
    type: "object",
    properties: {
      preferences: {
        type: "string",
        description: "التفضيلات (مثال: نباتي، بدون جلوتين، حساسية مكسرات)",
      },
      days: { type: "number", description: "عدد الأيام" },
      people: { type: "number", description: "عدد الأشخاص" },
    },
    required: ["days", "people"],
  },
  async execute(params) {
    const preferences = String(params.preferences || "").trim();
    const days = Math.max(1, Math.min(14, Number(params.days) || 1));
    const people = Math.max(1, Math.min(20, Number(params.people) || 1));

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + extract prefs ═══
      const prefLower = preferences.toLowerCase();
      const isVegan = /نباتي|vegan/.test(prefLower);
      const isVegetarian = /نبات|vegetarian/.test(prefLower);
      const allergies = (prefLower.match(/حساسية\s+([\p{L}\s,]+)/u) || [])[1] || "";
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Pre-compute expected list size ═══
      const mealsPerDay = 4; // breakfast + lunch + dinner + snack
      const expectedMeals = days * mealsPerDay;
      const expectedServings = expectedMeals * people;
      stepsCompleted.push("compute_list_size");

      // ═══ Step 3: AI generation — meals + shopping + tips ═══
      const systemPrompt = `خطط وجبات ${days} أيام لـ ${people} أشخاص. تفضيلات: ${preferences || "عامة"}.
رجّع JSON فقط:
{"meals":[{"day":1,"breakfast":"","lunch":"","dinner":"","snack":""}],"shopping_list":[{"item":"","quantity":"","category":""}],"prep_tips":[],"estimated_cost":0}
- meals فيه ${days} يوم بالظبط (day من 1 لـ ${days}).
- احترم الحساسيات والنظام الغذائي.
- quantities محسوبة لـ ${people} أشخاص.
- category واحدة من: ${SHOPPING_CATEGORIES.join("، ")}.
- prep_tips 5 نصائح تحضير قصيرة.
- estimated_cost تقدير بالجنيه المصري.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `خطط ${days} أيام لـ ${people} أشخاص. تفضيلات: ${preferences}.`,
        maxTokens: 3000,
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

      // ═══ Step 4: Validate + fill missing days + categorize ═══
      const data = result.data || {};
      let meals = Array.isArray(data.meals) ? data.meals : [];

      // املأ الأيام الناقصة
      const filledMeals: any[] = [];
      for (let i = 0; i < days; i++) {
        const existing = meals[i] || meals.find((m: any) => m.day === i + 1);
        filledMeals.push({
          day: i + 1,
          breakfast: String(existing?.breakfast || ""),
          lunch: String(existing?.lunch || ""),
          dinner: String(existing?.dinner || ""),
          snack: String(existing?.snack || ""),
        });
      }
      meals = filledMeals;

      // نظّف + صحّح تصنيفات قائمة التسوق
      const shoppingList = (Array.isArray(data.shopping_list) ? data.shopping_list : [])
        .filter((s: any) => s && String(s.item || "").trim())
        .map((s: any, idx: number) => {
          const cat = String(s.category || "").trim();
          return {
            item: String(s.item).trim(),
            quantity: String(s.quantity || "").trim(),
            category: SHOPPING_CATEGORIES.includes(cat) ? cat : "أخرى",
            _idx: idx,
          };
        });

      const prepTips = Array.isArray(data.prep_tips)
        ? data.prep_tips.map((t: any) => String(t))
        : [];
      stepsCompleted.push("validate_fill_days");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "recipe_meal_planner",
          days,
          people,
          preferences: preferences || "عامة",
          is_vegan: isVegan,
          is_vegetarian: isVegetarian,
          allergies: allergies.trim(),
          meals,
          meals_count: meals.length,
          shopping_list: shoppingList,
          shopping_items_count: shoppingList.length,
          prep_tips: prepTips,
          estimated_cost: Number(data.estimated_cost) || 0,
          expected_meals: expectedMeals,
          expected_servings: expectedServings,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
