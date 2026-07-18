/**
 * MCP Tool: Study Plan Generator (Scenario)
 * سيناريو متعدد الخطوات: خطة مذاكرة يومية + موارد + تمارين + استراتيجية امتحان
 *
 * الخطوات:
 *  1) التحقق من المدخلات + حساب عدد الأيام المتبقية للامتحان
 *  2) حساب إجمالي الساعات المتوقعة + توزيعها على الأيام
 *  3) استدعاء GLM لتوليد الخطة اليومية + الاستراتيجية + جدول الراحات
 *  4) التحقق من وجود خطة كاملة + إكمال الأيام الناقصة + حساب الإجمالي
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

function daysUntil(dateStr: string): number {
  try {
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  } catch {
    return 0;
  }
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const studyPlanGeneratorTool: MCPTool = {
  name: "study_plan_generator",
  description:
    "ولّد خطة مذاكرة يومية (مواضيع + مدة + موارد + تمارين) + استراتيجية امتحان. استخدمها لما المستخدم يقول 'خطة مذاكرة' أو 'study plan' أو 'جدول مذاكرة'.",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "اسم المادة" },
      examDate: { type: "string", description: "تاريخ الامتحان (YYYY-MM-DD)" },
      currentLevel: { type: "string", description: "المستوى الحالي (مبتدئ، متوسط، متقدم)" },
      hoursPerDay: { type: "number", description: "عدد ساعات المذاكرة في اليوم" },
    },
    required: ["subject", "examDate"],
  },
  async execute(params) {
    const subject = String(params.subject || "").trim();
    const examDate = String(params.examDate || "").trim();
    const currentLevel = String(params.currentLevel || "").trim();
    const hoursPerDay = Math.max(1, Math.min(12, Number(params.hoursPerDay) || 2));

    if (!subject) return { success: false, error: "subject مطلوب" };
    if (!examDate) return { success: false, error: "examDate مطلوب" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + compute days until exam ═══
      const daysLeft = daysUntil(examDate);
      if (daysLeft <= 0) {
        return { success: false, error: "تاريخ الامتحان لازم يكون في المستقبل" };
      }
      const totalDays = Math.min(daysLeft, 60); // حد أقصى 60 يوم
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Compute expected total hours ═══
      const expectedTotalHours = totalDays * hoursPerDay;
      stepsCompleted.push("compute_hours");

      // ═══ Step 3: AI generation — plan + strategy ═══
      const systemPrompt = `ولّد خطة مذاكرة لمادة ${subject} قبل امتحان ${examDate} (بعد ${totalDays} يوم).
المستوى: ${currentLevel || "متوسط"}. ساعات/يوم: ${hoursPerDay}.
رجّع JSON فقط:
{"plan":[{"day":1,"date":"","topics":[],"duration":"","resources":[],"practice":""}],"total_hours":0,"exam_strategy":"","break_schedule":""}
- plan فيه ${totalDays} يوم بالظبط.
- date بصيغة YYYY-MM-DD بداية من اليوم.
- topics 2-4 مواضيع لكل يوم.
- duration بصيغة "X ساعات".
- resources 2-3 موارد (كتب، فيديوهات، روابط).
- practice: تمرين أو سؤال للتطبيق.
- total_hours: مجموع الساعات.
- exam_strategy 3-4 أسطر.
- break_schedule: جدول الراحات (مثال: 25 دقيقة دراسة + 5 دقائق راحة).`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `المادة: ${subject}. تاريخ الامتحان: ${examDate}. المستوى: ${currentLevel}. ساعات/يوم: ${hoursPerDay}.`,
        maxTokens: 3500,
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

      // ═══ Step 4: Validate + fill missing days + recompute total ═══
      const data = result.data || {};
      let plan = Array.isArray(data.plan) ? data.plan : [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const filledPlan: any[] = [];
      for (let i = 0; i < totalDays; i++) {
        const existing = plan[i] || plan.find((p: any) => p.day === i + 1);
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        filledPlan.push({
          day: i + 1,
          date: String(existing?.date || formatDate(d)),
          topics: Array.isArray(existing?.topics)
            ? existing.topics.map((t: any) => String(t))
            : [`موضوع ${subject} - جزء ${i + 1}`],
          duration: String(existing?.duration || `${hoursPerDay} ساعات`),
          resources: Array.isArray(existing?.resources)
            ? existing.resources.map((r: any) => String(r))
            : [],
          practice: String(existing?.practice || ""),
        });
      }
      plan = filledPlan;

      // احسب الإجمالي الفعلي لو الـ AI ما حسبهوش
      const computedTotal =
        Number(data.total_hours) || expectedTotalHours || totalDays * hoursPerDay;

      const examStrategy = String(data.exam_strategy || "");
      const breakSchedule = String(data.break_schedule || "");
      stepsCompleted.push("validate_fill_days");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "study_plan_generator",
          subject,
          exam_date: examDate,
          days_until_exam: daysLeft,
          plan_days: totalDays,
          current_level: currentLevel || "متوسط",
          hours_per_day: hoursPerDay,
          plan,
          plan_entries: plan.length,
          total_hours: computedTotal,
          expected_total_hours: expectedTotalHours,
          exam_strategy: examStrategy,
          break_schedule: breakSchedule,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
