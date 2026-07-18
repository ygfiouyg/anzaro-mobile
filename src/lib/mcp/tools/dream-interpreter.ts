/**
 * MCP Tool: Dream Interpreter (Scenario)
 * سيناريو متعدد الخطوات: تفسير حلم (رموز + مشاعر + معاني نفسية + نصائح)
 *
 * الخطوات:
 *  1) التحقق من المدخلات + تقسيم الوصف لجمل
 *  2) استخراج الكلمات المفتاحية المرشحة كرموز (pre-scan)
 *  3) استدعاء GLM لتفسير الرموز + المشاعر + المعاني + النصائح
 *  4) التحقق من وجود الحقول الأساسية + إكمال الناقص
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const COMMON_DREAM_SYMBOLS = [
  "ماء", "نار", "بحر", "نهر", "سماء", "قمر", "شمس", "نجوم",
  "طيران", "سقوط", "موت", "ميلاد", "زواج", "بيت", "باب", "طريق",
  "كلب", "قط", "حصان", "ثعبان", "أسد", "عصفور", "شجرة", "وردة",
  "ذهب", "فضة", "نقود", "سفر", "غريب", "ظل", "ضوء", "ظلام",
];

export const dreamInterpreterTool: MCPTool = {
  name: "dream_interpreter",
  description:
    "فسر حلم (رموز + مشاعر + معاني نفسية + نصائح). استخدمها لما المستخدم يقول 'فسر حلمي' أو 'dream interpretation' أو 'حلمت بـ'.",
  parameters: {
    type: "object",
    properties: {
      dreamDescription: { type: "string", description: "وصف الحلم بالتفصيل" },
    },
    required: ["dreamDescription"],
  },
  async execute(params) {
    const dreamDescription = String(params.dreamDescription || "").trim();
    if (!dreamDescription) return { success: false, error: "dreamDescription مطلوب" };
    if (dreamDescription.length < 10) {
      return { success: false, error: "وصف الحلم قصير جداً — اكتب تفاصيل أكتر" };
    }

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + split into sentences ═══
      const sentences = dreamDescription
        .split(/[.؟!\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 3);
      stepsCompleted.push("validate_inputs");

      // ═══ Step 2: Pre-scan for common dream symbols ═══
      const textLower = dreamDescription.toLowerCase();
      const detectedSymbols = COMMON_DREAM_SYMBOLS.filter((sym) =>
        dreamDescription.includes(sym) || textLower.includes(sym.toLowerCase()),
      );
      const detectedEmotions = (
        dreamDescription.match(/خوف|فرح|حزن|قلق|سعادة|غضب|حب|مفاجأة|اطمئنان/g) || []
      ).filter((v, i, a) => a.indexOf(v) === i);
      stepsCompleted.push("pre_scan_symbols");

      // ═══ Step 3: AI generation — interpretation ═══
      const systemPrompt = `فسر الحلم ده: ${dreamDescription}.
رجّع JSON فقط:
{"symbols":[{"symbol":"","meaning":""}],"emotions":[],"interpretation":"","psychological_meaning":"","advice":""}
- symbols: 3-7 رموز رئيسية في الحلم مع معناها.
- emotions: 2-4 مشاعر مرتبطة بالحلم.
- interpretation: تفسير عام 3-5 أسطر.
- psychological_meaning: المعنى النفسي 2-3 أسطر.
- advice: نصيحة عملية 2-3 أسطر.
- اكتب بأسلوب محترم ومراعي ثقافياً.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الحلم: ${dreamDescription}`,
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
      stepsCompleted.push("ai_generate_interpretation");

      // ═══ Step 4: Validate + fill missing ═══
      const data = result.data || {};
      const symbols = Array.isArray(data.symbols)
        ? data.symbols
            .filter((s: any) => s && (s.symbol || s.meaning))
            .map((s: any) => ({
              symbol: String(s.symbol || "").trim(),
              meaning: String(s.meaning || "").trim(),
            }))
        : [];

      // لو مفيش symbols من الـ AI، استخدم الـ pre-scan
      const finalSymbols =
        symbols.length > 0
          ? symbols
          : detectedSymbols.slice(0, 5).map((sym) => ({ symbol: sym, meaning: "رمز شائع في الأحلام" }));

      const emotions = Array.isArray(data.emotions)
        ? data.emotions.map((e: any) => String(e))
        : detectedEmotions;

      const interpretation = String(data.interpretation || "");
      const psychologicalMeaning = String(data.psychological_meaning || "");
      const advice = String(data.advice || "");
      stepsCompleted.push("validate_fill_fields");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "dream_interpreter",
          dream_description: dreamDescription,
          dream_length: dreamDescription.length,
          sentences_count: sentences.length,
          detected_symbols_pre_scan: detectedSymbols,
          symbols: finalSymbols,
          emotions,
          interpretation,
          psychological_meaning: psychologicalMeaning,
          advice,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
