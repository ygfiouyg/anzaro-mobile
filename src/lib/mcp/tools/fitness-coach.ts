/**
 * MCP Tool: Fitness Coach
 * سيناريو: حلل بيانات لياقة → نصائح تدريب شخصية
 * n8n template: "AI Fitness Coach Strava Data Analysis and Personalized Training Insights"
 * 
 * الخطوات:
 * 1. اقبل بيانات المستخدم (عمر، وزن، هدف، نشاط حالي)
 * 2. حلل + ولّد خطة تدريب
 * 3. نصائح تغذية
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const fitnessCoachTool: MCPTool = {
  name: "fitness_coach",
  description: "مدرب لياقة شخصي — خطة تدريب + نصائح تغذية (سيناريو متكامل). استخدمها لما المستخدم يقول 'خطة تدريب' أو 'fitness' أو 'تمارين'.",
  parameters: {
    type: "object",
    properties: {
      age: { type: "number", description: "العمر" },
      weight: { type: "number", description: "الوزن بالكيلو" },
      height: { type: "number", description: "الطول بالسم" },
      goal: { type: "string", description: "الهدف: lose_weight, gain_muscle, endurance, general_fitness" },
      currentActivity: { type: "string", description: "مستوى النشاط: sedentary, light, moderate, active" },
      daysPerWeek: { type: "number", description: "عدد أيام التدريب الممكنة (افتراضي: 3)", default: 3 },
      equipment: { type: "string", description: "المعدات المتاحة: gym, home, bodyweight (افتراضي: bodyweight)", default: "bodyweight" },
    },
    required: ["age", "weight", "goal"],
  },
  async execute(params) {
    const age = Number(params.age);
    const weight = Number(params.weight);
    const height = Number(params.height) || 0;
    const goal = String(params.goal || "general_fitness");
    const currentActivity = String(params.currentActivity || "sedentary");
    const daysPerWeek = Math.min(7, Math.max(2, Number(params.daysPerWeek) || 3));
    const equipment = String(params.equipment || "bodyweight");

    if (!age || !weight) return { success: false, error: "age و weight مطلوبين" };

    try {
      // ═══ حساب BMI ═══
      let bmi = 0;
      let bmiCategory = "";
      if (height > 0) {
        bmi = Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10;
        bmiCategory = bmi < 18.5 ? "نحيف" : bmi < 25 ? "طبيعي" : bmi < 30 ? "زيادة وزن" : "سمنة";
      }

      // ═══ خطة تدريب + تغذية ═══
      const plan = await callGLMForJSON({
        systemPrompt: `أنت مدرب لياقة محترف. حضّر خطة تدريب شخصية.
البيانات: عمر ${age}، وزن ${weight}كج، طول ${height}سم، BMI ${bmi} (${bmiCategory})
الهدف: ${goal}
النشاط الحالي: ${currentActivity}
أيام التدريب: ${daysPerWeek}/أسبوع
المعدات: ${equipment}

رجّع JSON:
{
  "bmi": ${bmi},
  "bmi_category": "${bmiCategory}",
  "weekly_plan": [
    {"day":"اليوم 1","focus":"","exercises":[{"name":"","sets":0,"reps":""}],"duration":""}
  ],
  "nutrition": {
    "daily_calories": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fats_g": 0,
    "meal_suggestions": ["وجبة 1","وجبة 2"]
  },
  "tips": ["نصيحة 1","نصيحة 2"],
  "rest_days": "توصية للراحة",
  "progression": "متى يزيد شدة التدريب"
}`,
        userMessage: `${age}, ${weight}kg, goal: ${goal}`,
        maxTokens: 1500,
        temperature: 0.5,
      });

      const result = plan.data || {};

      return {
        success: true,
        data: {
          scenario: "fitness_coach",
          user_profile: { age, weight, height, bmi, bmi_category: bmiCategory, goal, activity: currentActivity, days: daysPerWeek, equipment },
          steps: { calculate_bmi: bmi > 0, generate_plan: !!result.weekly_plan },
          weekly_plan: result.weekly_plan || [],
          nutrition: result.nutrition || {},
          tips: result.tips || [],
          rest_days: result.rest_days || "",
          progression: result.progression || "",
          disclaimer: "⚠️ استشر طبيب قبل بدء أي برنامج تدريب.",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
