/**
 * MCP Tool: Book Summarizer (Scenario)
 * سيناريو متعدد الخطوات: تلخيص كتاب/فصل + استخراج دروس + اقتباسات + actions
 *
 * الخطوات:
 *  1) التحقق من المدخلات + chunk النص لو طويل
 *  2) Pre-stats: عدد الكلمات/الأسطر/الأحرف
 *  3) استدعاء GLM للتلخيص + الدروس + الاقتباسات + actions
 *  4) التحقق من rating + إعادة تنسيق action items
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const MAX_CHARS = 8000;

export const bookSummarizerTool: MCPTool = {
  name: "book_summarizer",
  description:
    "لخّص كتاب/فصل + استخرج دروس + اقتباسات + action items + تقييم. استخدمها لما المستخدم يقول 'لخّص كتاب' أو 'summarize book' أو 'key lessons'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "محتوى الكتاب/الفصل" },
      title: { type: "string", description: "عنوان الكتاب (اختياري)" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    const title = String(params.title || "الكتاب").trim();
    if (!text || text.length < 50) {
      return { success: false, error: "text مطلوب (50 حرف على الأقل)" };
    }

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + chunk text ═══
      const wasChunked = text.length > MAX_CHARS;
      const processedText = wasChunked ? text.slice(0, MAX_CHARS) : text;
      stepsCompleted.push("validate_and_chunk");

      // ═══ Step 2: Pre-stats ═══
      const wordCount = processedText.split(/\s+/).filter(Boolean).length;
      const lineCount = processedText.split(/\n/).length;
      const charCount = processedText.length;
      stepsCompleted.push("compute_stats");

      // ═══ Step 3: AI generation — summary + lessons + quotes + actions ═══
      const systemPrompt = `لخّص الكتاب/الفصل ده + اشرحه.
العنوان: ${title}.
رجّع JSON فقط:
{"summary":"","key_lessons":[],"quotes":[],"action_items":[],"target_audience":"","rating":0}
- summary 3-5 أسطر.
- key_lessons 5 دروس.
- quotes 3 اقتباسات حرفية لو موجودة.
- action_items 5 خطوات عملية.
- rating من 0 لـ 5.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: processedText,
        maxTokens: 2000,
        temperature: 0.4,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_summarize");

      // ═══ Step 4: Validate + normalize ═══
      const data = result.data || {};
      const rating = Math.max(0, Math.min(5, Number(data.rating) || 0));

      const normalized = {
        summary: String(data.summary || "").trim(),
        key_lessons: Array.isArray(data.key_lessons)
          ? data.key_lessons.map((l: any) => String(l))
          : [],
        quotes: Array.isArray(data.quotes) ? data.quotes.map((q: any) => String(q)) : [],
        action_items: Array.isArray(data.action_items)
          ? data.action_items.map((a: any) => String(a))
          : [],
        target_audience: String(data.target_audience || "").trim(),
        rating,
      };
      stepsCompleted.push("validate_normalize");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "book_summarizer",
          title,
          text_stats: {
            words: wordCount,
            lines: lineCount,
            chars: charCount,
            was_truncated: wasChunked,
          },
          ...normalized,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
