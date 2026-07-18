/**
 * MCP Tool: Pitch Deck Generator (Scenario)
 * سيناريو متعدد الخطوات: توليد عرض تقديمي (شرائح + محتوى + ملاحظات + elevator pitch)
 *
 * الخطوات:
 *  1) التحقق من المدخلات + تحليل المرحلة والجمهور
 *  2) حساب عدد الشرائح المثالي حسب المدة
 *  3) استدعاء GLM لتوليد الشرائح + المقاييس + FAQ + elevator pitch
 *  4) التحقق من الشرائح + إعادة ترقيمها + إكمال الناقص
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const STAGES = ["idea", "early", "growth", "scale", "mature"];
const AUDIENCES = ["investors", "customers", "partners", "employees", "media"];

export const pitchDeckGeneratorTool: MCPTool = {
  name: "pitch_deck_generator",
  description:
    "ولّد عرض تقديمي / pitch deck (شرائح + محتوى + ملاحظات المتحدث + مقاييس + FAQ + elevator pitch). استخدمها لما المستخدم يقول 'pitch deck' أو 'عرض تقديمي' أو 'عرض مستثمرين'.",
  parameters: {
    type: "object",
    properties: {
      idea: { type: "string", description: "فكرة المشروع أو المنتج" },
      stage: { type: "string", description: "المرحلة (idea, early, growth, scale, mature)" },
      audience: { type: "string", description: "الجمهور (investors, customers, partners, employees, media)" },
      duration: { type: "number", description: "المدة بالدقائق" },
    },
    required: ["idea"],
  },
  async execute(params) {
    const idea = String(params.idea || "").trim();
    let stage = String(params.stage || "").trim().toLowerCase();
    let audience = String(params.audience || "").trim().toLowerCase();
    const duration = Math.max(2, Math.min(60, Number(params.duration) || 10));

    if (!idea) return { success: false, error: "idea مطلوب" };
    if (!STAGES.includes(stage)) stage = "early";
    if (!AUDIENCES.includes(audience)) audience = "investors";

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + analyze stage/audience ═══
      const stageLabels: Record<string, string> = {
        idea: "فكرة",
        early: "مرحلة مبكرة",
        growth: "نمو",
        scale: "توسع",
        mature: "ناضج",
      };
      const audienceLabels: Record<string, string> = {
        investors: "مستثمرين",
        customers: "عملاء",
        partners: "شركاء",
        employees: "موظفين",
        media: "إعلام",
      };
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Compute ideal slide count ═══
      // ~1.5 دقيقة لكل شريحة
      const idealSlides = Math.max(5, Math.min(20, Math.round(duration / 1.5)));
      stepsCompleted.push("compute_slide_count");

      // ═══ Step 3: AI generation — slides + metrics + FAQ + elevator ═══
      const systemPrompt = `ولّد عرض تقديمي لـ ${idea}. المرحلة: ${stageLabels[stage]}. الجمهور: ${audienceLabels[audience]}. المدة: ${duration} دقيقة.
رجّع JSON فقط:
{"slides":[{"number":1,"title":"","content":"","speaker_notes":"","visual":""}],"key_metrics":[],"faq":[{"question":"","answer":""}],"elevator_pitch":""}
- slides فيه ${idealSlides} شرائح.
- أهم شرائح: المشكلة، الحل، السوق، المنتج، نموذج العمل، الفريق، التمويل المطلوب.
- content 2-4 نقاط مختصرة.
- speaker_notes ما يقوله المتحدث.
- visual: وصف بصري للشريحة (رسم بياني، صورة، الخ).
- key_metrics 4-6 مقاييس رئيسية.
- faq 3-5 أسئلة شائعة + إجابات.
- elevator_pitch: نص 30 ثانية.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الفكرة: ${idea}. المرحلة: ${stage}. الجمهور: ${audience}. المدة: ${duration} دقيقة.`,
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
      stepsCompleted.push("ai_generate_deck");

      // ═══ Step 4: Validate + renumber slides + fill missing ═══
      const data = result.data || {};
      let slides = Array.isArray(data.slides)
        ? data.slides.filter((s: any) => s && (s.title || s.content))
        : [];

      // لو في شرائح أقل من المطلوب، سيبها زي ما هي (مش هنكمل بـ placeholders فارغة)
      // لكن رتّب الـ numbers بالظبط
      slides = slides.map((s: any, i: number) => ({
        number: i + 1,
        title: String(s.title || `شريحة ${i + 1}`).trim(),
        content: String(s.content || "").trim(),
        speaker_notes: String(s.speaker_notes || "").trim(),
        visual: String(s.visual || "").trim(),
      }));

      const keyMetrics = Array.isArray(data.key_metrics)
        ? data.key_metrics.map((m: any) => String(m))
        : [];

      const faq = Array.isArray(data.faq)
        ? data.faq
            .filter((f: any) => f && (f.question || f.answer))
            .map((f: any) => ({
              question: String(f.question || "").trim(),
              answer: String(f.answer || "").trim(),
            }))
        : [];

      const elevatorPitch = String(data.elevator_pitch || "").trim();
      stepsCompleted.push("validate_renumber_slides");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "pitch_deck_generator",
          idea,
          stage,
          stage_label: stageLabels[stage],
          audience,
          audience_label: audienceLabels[audience],
          duration_minutes: duration,
          ideal_slides: idealSlides,
          slides,
          slides_generated: slides.length,
          key_metrics: keyMetrics,
          faq,
          faq_count: faq.length,
          elevator_pitch: elevatorPitch,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
