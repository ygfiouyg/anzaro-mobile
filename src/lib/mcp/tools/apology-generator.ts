/**
 * MCP Tool: Apology Generator (Scenario)
 * سيناريو متعدد الخطوات: توليد اعتذار مناسب (نص + شرح + تعويض + متابعة + نسخ بديلة)
 *
 * الخطوات:
 *  1) التحقق من المدخلات + تحليل الخطورة
 *  2) بناء إعدادات النبرة المناسبة حسب الخطورة
 *  3) استدعاء GLM لتوليد الاعتذار + النسخ البديلة
 *  4) التحقق من الحقول + التأكد من وجود النسخ البديلة
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const SEVERITY_LEVELS = ["منخفض", "متوسط", "عالي", "حرج"];
const TONE_OPTIONS = ["رسمي", "ودود", "صادق", "مباشر", "عاطفي"];

export const apologyGeneratorTool: MCPTool = {
  name: "apology_generator",
  description:
    "ولّد اعتذار مناسب (نص + شرح + تعويض + متابعة + نسخ بديلة بنبرات مختلفة). استخدمها لما المستخدم يقول 'اكتب اعتذار' أو 'apology' أو 'اعتذر لـ'.",
  parameters: {
    type: "object",
    properties: {
      situation: { type: "string", description: "وصف الموقف (مثال: تأخرت عن اجتماع مهم)" },
      recipient: { type: "string", description: "المستلم (مثال: مديري، صديقي، زوجتي)" },
      tone: { type: "string", description: "النبرة (رسمي، ودود، صادق، مباشر، عاطفي)" },
      severity: { type: "string", description: "الخطورة (منخفض، متوسط، عالي، حرج)" },
    },
    required: ["situation", "recipient"],
  },
  async execute(params) {
    const situation = String(params.situation || "").trim();
    const recipient = String(params.recipient || "").trim();
    let tone = String(params.tone || "").trim();
    let severity = String(params.severity || "").trim();

    if (!situation) return { success: false, error: "situation مطلوب" };
    if (!recipient) return { success: false, error: "recipient مطلوب" };

    if (!TONE_OPTIONS.includes(tone)) tone = "صادق";
    if (!SEVERITY_LEVELS.includes(severity)) severity = "متوسط";

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + analyze severity ═══
      const severityScore = SEVERITY_LEVELS.indexOf(severity) + 1; // 1-4
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Determine tone recommendations ═══
      const recommendedTones: string[] = [];
      if (severityScore >= 3) {
        recommendedTones.push("رسمي", "صادق");
      } else if (severityScore === 2) {
        recommendedTones.push("صادق", "ودود");
      } else {
        recommendedTones.push("ودود", "مباشر");
      }
      if (!recommendedTones.includes(tone)) recommendedTones.unshift(tone);
      stepsCompleted.push("determine_tones");

      // ═══ Step 3: AI generation — apology + alternatives ═══
      const systemPrompt = `ولّد اعتذار لـ ${recipient} عن: ${situation}.
النبرة: ${tone}. الخطورة: ${severity}.
رجّع JSON فقط:
{"apology":"","explanation":"","amends":"","follow_up":"","alternative_versions":[{"tone":"","version":""}]}
- apology: نص الاعتذار الأساسي 3-5 أسطر.
- explanation: شرح موجز بدون أعذار 2-3 أسطر.
- amends: كيف تعوّض (اقتراح عملي).
- follow_up: متابعة مقترحة (متى/كيف).
- alternative_versions: 2-3 نسخ بنبرات مختلفة (${TONE_OPTIONS.join("، ")}).`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الموقف: ${situation}. المستلم: ${recipient}. النبرة: ${tone}. الخطورة: ${severity}.`,
        maxTokens: 2000,
        temperature: 0.6,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_generate_apology");

      // ═══ Step 4: Validate + ensure alternatives ═══
      const data = result.data || {};
      const apology = String(data.apology || "").trim();
      const explanation = String(data.explanation || "").trim();
      const amends = String(data.amends || "").trim();
      const followUp = String(data.follow_up || "").trim();

      let alternativeVersions = Array.isArray(data.alternative_versions)
        ? data.alternative_versions
            .filter((v: any) => v && v.version)
            .map((v: any) => ({
              tone: String(v.tone || "").trim(),
              version: String(v.version).trim(),
            }))
        : [];

      // لو مفيش نسخ بديلة كفاية، حط placeholder
      if (alternativeVersions.length === 0 && apology) {
        alternativeVersions = [
          { tone: "رسمي", version: apology },
          { tone: "ودود", version: apology },
        ];
      }
      stepsCompleted.push("validate_fill_alternatives");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "apology_generator",
          situation,
          recipient,
          tone,
          severity,
          severity_score: severityScore,
          recommended_tones: recommendedTones,
          apology,
          explanation,
          amends,
          follow_up: followUp,
          alternative_versions: alternativeVersions,
          alternatives_count: alternativeVersions.length,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
