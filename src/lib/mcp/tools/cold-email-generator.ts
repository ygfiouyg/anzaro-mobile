/**
 * MCP Tool: Cold Email Generator (Scenario)
 * سيناريو متعدد الخطوات: توليد سلسلة 3 إيميلات (intro + followup + breakup)
 *
 * الخطوات:
 *  1) التحقق من المدخلات + استخراج persona من target
 *  2) Pre-template: تحديد التوقيت لكل إيميل (Day 1, Day 3, Day 7)
 *  3) استدعاء GLM لتوليد السلسلة كاملة
 *  4) التحقق من وجود 3 إيميلات + ترتيبها + استخراج subjects
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const EMAIL_SEQUENCE = [
  { type: "intro", timing: "Day 1", purpose: "تقديم + قيمة أولى" },
  { type: "followup", timing: "Day 3", purpose: "متابعة + social proof" },
  { type: "breakup", timing: "Day 7", purpose: "إغلاق + آخر فرصة" },
];

export const coldEmailGeneratorTool: MCPTool = {
  name: "cold_email_generator",
  description:
    "ولّد سلسلة 3 إيميلات باردة (intro + followup + breakup) + استراتيجية + نصائح. استخدمها لما المستخدم يقول 'إيميل بارد' أو 'cold email' أو 'سلسلة إيميلات'.",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", description: "الجمهور المستهدف (من؟)" },
      product: { type: "string", description: "المنتج/الخدمة" },
      goal: { type: "string", description: "الهدف (demo, reply, signup)" },
    },
    required: ["target", "product"],
  },
  async execute(params) {
    const target = String(params.target || "").trim();
    const product = String(params.product || "").trim();
    const goal = String(params.goal || "").trim();

    if (!target) return { success: false, error: "target مطلوب" };
    if (!product) return { success: false, error: "product مطلوب" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + extract persona ═══
      const persona = target.slice(0, 80);
      const goalStr = goal || "حجز مكالمة/demo";
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Pre-template — define sequence timing ═══
      const sequencePlan = EMAIL_SEQUENCE.map((e) => ({
        ...e,
        target_persona: persona,
        goal: goalStr,
      }));
      stepsCompleted.push("plan_sequence_timing");

      // ═══ Step 3: AI generation — 3-email sequence ═══
      const systemPrompt = `أنت copywriter محترف. ولّد سلسلة 3 إيميلات لـ ${target} عن ${product}.
الهدف: ${goalStr}.
رجّع JSON فقط:
{"emails":[{"subject":"","body":"","type":"intro|followup|breakup","timing":""}],"strategy":"","tips":[]}
- 3 إيميلات بالظبط: intro (Day 1), followup (Day 3), breakup (Day 7).
- subject قصير وجذاب.
- body 80-150 كلمة، فيه CTA واضح.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الجمهور: ${target}. المنتج: ${product}. الهدف: ${goalStr}.`,
        maxTokens: 2500,
        temperature: 0.7,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_generate_emails");

      // ═══ Step 4: Validate 3 emails + reorder ═══
      const data = result.data || {};
      let emails = Array.isArray(data.emails) ? data.emails : [];

      // ادمج مع الـ sequence plan: لو نقص إيميل، اعتبره فاضي
      const orderedEmails = EMAIL_SEQUENCE.map((seq) => {
        const found = emails.find(
          (e: any) => String(e.type || "").toLowerCase() === seq.type
        );
        return {
          subject: String(found?.subject || ""),
          body: String(found?.body || ""),
          type: seq.type,
          timing: String(found?.timing || seq.timing),
        };
      });

      const validEmailsCount = orderedEmails.filter((e) => e.subject && e.body).length;
      const tips = Array.isArray(data.tips) ? data.tips : [];
      stepsCompleted.push("validate_sequence");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "cold_email_generator",
          target: persona,
          product,
          goal: goalStr,
          sequence_plan: sequencePlan,
          emails: orderedEmails,
          strategy: String(data.strategy || ""),
          tips,
          emails_generated: validEmailsCount,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
