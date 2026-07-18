/**
 * MCP Tool: Personal Statement (Scenario)
 * سيناريو متعدد الخطوات: كتابة personal statement + نسخ بديلة + نصائح
 *
 * الخطوات:
 *  1) التحقق من المدخلات + تحليل الهدف (university/job/scholarship)
 *  2) استخراج الإنجازات والأهداف + حساب الكلمات
 *  3) استدعاء GLM لكتابة الـ statement + الافتتاحية + الخاتمة + النسخ البديلة
 *  4) حساب عدد الكلمات الفعلي + التحقق من الطول المثالي
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const PURPOSES = ["university", "job", "scholarship", "grad-school", "fellowship"];

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const personalStatementTool: MCPTool = {
  name: "personal_statement",
  description:
    "اكتب personal statement (نص كامل + افتتاحية + خاتمة + نسخ بديلة + نصائح). استخدمها لما المستخدم يقول 'personal statement' أو 'خطاب تحفيزي' أو 'مقال قبول'.",
  parameters: {
    type: "object",
    properties: {
      purpose: {
        type: "string",
        description: "الغرض (university, job, scholarship, grad-school, fellowship)",
      },
      background: { type: "string", description: "الخلفية الأكاديمية/المهنية" },
      achievements: { type: "string", description: "الإنجازات (مفصولة بفواصل)" },
      goals: { type: "string", description: "الأهداف المستقبلية" },
    },
    required: ["purpose", "background"],
  },
  async execute(params) {
    let purpose = String(params.purpose || "").trim().toLowerCase();
    const background = String(params.background || "").trim();
    const achievements = String(params.achievements || "").trim();
    const goals = String(params.goals || "").trim();

    if (!purpose) return { success: false, error: "purpose مطلوب" };
    if (!background) return { success: false, error: "background مطلوب" };
    if (!PURPOSES.includes(purpose)) purpose = "university";

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + analyze purpose ═══
      const purposeLabels: Record<string, string> = {
        university: "قبول جامعي",
        job: "وظيفة",
        scholarship: "منحة دراسية",
        "grad-school": "دراسات عليا",
        fellowship: "زمالة",
      };
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Extract achievements + compute target word count ═══
      const achievementsList = achievements
        .split(/[,،\n;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const goalsList = goals
        .split(/[,،\n;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // الهدف الأمثل لعدد الكلمات حسب الغرض
      const targetWordCount: Record<string, number> = {
        university: 500,
        job: 400,
        scholarship: 600,
        "grad-school": 750,
        fellowship: 500,
      };
      const targetWords = targetWordCount[purpose] || 500;
      stepsCompleted.push("analyze_achievements");

      // ═══ Step 3: AI generation — statement + alternatives ═══
      const systemPrompt = `اكتب personal statement لـ ${purposeLabels[purpose]}.
الخلفية: ${background}. الإنجازات: ${achievements || "غير محددة"}. الأهداف: ${goals || "غير محددة"}.
رجّع JSON فقط:
{"statement":"","opening":"","closing":"","alternative_versions":[],"tips":[]}
- statement: النص الكامل (~${targetWords} كلمة).
- opening: جملة افتتاحية قوية.
- closing: جملة ختامية مؤثرة.
- alternative_versions: 2-3 نسخ مختصرة بنبرات مختلفة.
- tips: 4-5 نصائح للتحسين.
- اكتب بأسلوب شخصي صادق ومحترف.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الغرض: ${purposeLabels[purpose]}. الخلفية: ${background}. الإنجازات: ${achievements}. الأهداف: ${goals}.`,
        maxTokens: 3000,
        temperature: 0.6,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_generate_statement");

      // ═══ Step 4: Compute word count + validate ═══
      const data = result.data || {};
      const statement = String(data.statement || "").trim();
      const opening = String(data.opening || "").trim();
      const closing = String(data.closing || "").trim();

      const alternativeVersions = Array.isArray(data.alternative_versions)
        ? data.alternative_versions.map((v: any) => String(v))
        : [];

      const tips = Array.isArray(data.tips)
        ? data.tips.map((t: any) => String(t))
        : [];

      const wordCount = countWords(statement);
      const lengthStatus =
        wordCount < targetWords * 0.7
          ? "قصير"
          : wordCount > targetWords * 1.3
            ? "طويل"
            : "مثالي";
      stepsCompleted.push("compute_word_count");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "personal_statement",
          purpose,
          purpose_label: purposeLabels[purpose],
          background,
          achievements: achievementsList,
          achievements_count: achievementsList.length,
          goals: goalsList,
          goals_count: goalsList.length,
          statement,
          opening,
          closing,
          alternative_versions: alternativeVersions,
          alternatives_count: alternativeVersions.length,
          tips,
          word_count: wordCount,
          target_word_count: targetWords,
          length_status: lengthStatus,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
