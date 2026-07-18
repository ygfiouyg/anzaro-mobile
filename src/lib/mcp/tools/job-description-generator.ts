/**
 * MCP Tool: Job Description Generator (Scenario)
 * سيناريو متعدد الخطوات: توليد وصف وظيفي كامل + أسئلة مقابلة + معايير تقييم
 *
 * الخطوات:
 *  1) التحقق من المدخلات + استخراج الكلمات المفتاحية للوظيفة
 *  2) بناء template أساسي (title/department) من المدخلات
 *  3) استدعاء GLM لتوليد الوصف الكامل + الأسئلة + المعايير
 *  4) التحقق من وجود الحقول الأساسية + إكمال الناقص
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const jobDescriptionGeneratorTool: MCPTool = {
  name: "job_description_generator",
  description:
    "ولّد وصف وظيفي كامل (مسؤوليات + متطلبات + مزايا + أسئلة مقابلة + معايير تقييم). استخدمها لما المستخدم يقول 'وصف وظيفي' أو 'job description' أو 'إعلان توظيف'.",
  parameters: {
    type: "object",
    properties: {
      role: { type: "string", description: "المسمى الوظيفي (مثال: مهندس برمجيات)" },
      department: { type: "string", description: "القسم (مثال: التطوير، التسويق)" },
      requirements: { type: "string", description: "المتطلبات الإضافية (خبرة، مهارات)" },
      company: { type: "string", description: "اسم الشركة" },
    },
    required: ["role", "department"],
  },
  async execute(params) {
    const role = String(params.role || "").trim();
    const department = String(params.department || "").trim();
    const requirements = String(params.requirements || "").trim();
    const company = String(params.company || "").trim();

    if (!role) return { success: false, error: "role مطلوب" };
    if (!department) return { success: false, error: "department مطلوب" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + extract keywords ═══
      const keywords = (role + " " + requirements)
        .toLowerCase()
        .split(/[\s,،]+/)
        .filter((w) => w.length > 3)
        .slice(0, 10);
      const isTechRole = /مطور|مهندس|برمج|developer|engineer|tech|data|ai|ml/i.test(
        role + " " + department,
      );
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Build base template ═══
      const baseTemplate = {
        title: role,
        company: company || "غير محدد",
        department,
        location: "غير محدد",
        employment_type: isTechRole ? "دوام كامل" : "دوام كامل",
      };
      stepsCompleted.push("build_template");

      // ═══ Step 3: AI generation — full JD + questions + criteria ═══
      const systemPrompt = `ولّد وصف وظيفي لـ ${role} في ${department}. الشركة: ${company || "غير محدد"}.
متطلبات إضافية: ${requirements || "عامة"}.
رجّع JSON فقط:
{"title":"","summary":"","responsibilities":[],"requirements":[],"nice_to_have":[],"benefits":[],"interview_questions":[],"evaluation_criteria":[]}
- summary 2-3 جمل.
- responsibilities 5-7 نقاط.
- requirements 5-7 نقاط.
- nice_to_have 3-4 نقاط.
- benefits 4-5 نقاط.
- interview_questions 5-7 أسئلة.
- evaluation_criteria 4-5 معايير.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الدور: ${role}. القسم: ${department}. الشركة: ${company}. المتطلبات: ${requirements}.`,
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
      stepsCompleted.push("ai_generate_jd");

      // ═══ Step 4: Validate + fill missing fields ═══
      const data = result.data || {};
      const toArray = (v: any): string[] =>
        Array.isArray(v) ? v.map((x) => String(x)) : [];

      const finalJD = {
        ...baseTemplate,
        title: String(data.title || role),
        summary: String(data.summary || ""),
        responsibilities: toArray(data.responsibilities),
        requirements: toArray(data.requirements),
        nice_to_have: toArray(data.nice_to_have),
        benefits: toArray(data.benefits),
        interview_questions: toArray(data.interview_questions),
        evaluation_criteria: toArray(data.evaluation_criteria),
      };

      // لو summary فاضي، اكتب افتراضي
      if (!finalJD.summary) {
        finalJD.summary = `نبحث عن ${role} للانضمام لقسم ${department} في ${company || "شركتنا"}.`;
      }
      stepsCompleted.push("validate_fill_fields");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "job_description_generator",
          ...finalJD,
          keywords_extracted: keywords,
          is_tech_role: isTechRole,
          fields_filled:
            (finalJD.summary ? 1 : 0) +
            (finalJD.responsibilities.length ? 1 : 0) +
            (finalJD.requirements.length ? 1 : 0) +
            (finalJD.benefits.length ? 1 : 0) +
            (finalJD.interview_questions.length ? 1 : 0) +
            (finalJD.evaluation_criteria.length ? 1 : 0),
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
