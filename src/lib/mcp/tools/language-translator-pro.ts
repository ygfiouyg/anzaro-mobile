/**
 * MCP Tool: Language Translator Pro (Scenario)
 * سيناريو متعدد الخطوات: ترجمة + سياق ثقافي + بدائل + ترجمة حرفية
 *
 * الخطوات:
 *  1) التحقق من المدخلات + تطبيع اللغات (mapping للأسماء الشائعة)
 *  2) كشف اللغة الفعلية لو "from" = "auto"
 *  3) استدعاء GLM للترجمة + السياق + البدائل
 *  4) التحقق من وجود translation + تنظيف alternatives
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const LANG_NORMALIZE: Record<string, string> = {
  ar: "العربية",
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  tr: "Türkçe",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ur: "اردو",
  fa: "فارسی",
  he: "עברית",
  hi: "हिन्दी",
  pt: "Português",
  nl: "Nederlands",
};

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase().trim();
  return LANG_NORMALIZE[lower] || lang;
}

// كشف بسيط للغة بناءً على نطاق Unicode
function detectLang(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return "العربية";
  if (/[\u4e00-\u9fff]/.test(text)) return "中文";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "日本語";
  if (/[\uac00-\ud7af]/.test(text)) return "한국어";
  if (/[\u0400-\u04FF]/.test(text)) return "Русский";
  if (/[\u0590-\u05FF]/.test(text)) return "עברית";
  if (/[\u0900-\u097F]/.test(text)) return "हिन्दी";
  return "English";
}

export const languageTranslatorProTool: MCPTool = {
  name: "language_translator_pro",
  description:
    "ترجمة نص + سياق ثقافي + بدائل + ترجمة حرفية. استخدمها لما المستخدم يقول 'ترجم' أو 'translate' أو 'translation'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص المراد ترجمته" },
      from: { type: "string", description: "اللغة المصدر (auto = كشف تلقائي)" },
      to: { type: "string", description: "اللغة الهدف" },
    },
    required: ["text", "to"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    const fromRaw = String(params.from || "auto").trim();
    const toRaw = String(params.to || "").trim();

    if (!text) return { success: false, error: "text مطلوب" };
    if (!toRaw) return { success: false, error: "to مطلوبة" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + normalize languages ═══
      const to = normalizeLang(toRaw);
      stepsCompleted.push("normalize_languages");

      // ═══ Step 2: Detect source language if "auto" ═══
      const from = fromRaw === "auto" || !fromRaw ? detectLang(text) : normalizeLang(fromRaw);
      stepsCompleted.push("detect_source_lang");

      // ═══ Step 3: AI generation — translate + cultural + alternatives ═══
      const systemPrompt = `ترجم النص من ${from} لـ ${to} + اشرح السياق الثقافي.
رجّع JSON فقط:
{"translation":"","cultural_notes":"","alternatives":[],"literal_translation":"","context":""}
- translation: الترجمة الرئيسية الطبيعية.
- alternatives: 2-3 ترجمات بديلة بأسلوب مختلف.
- literal_translation: ترجمة كلمة بكلمة.
- cultural_notes: ملاحظات ثقافية مهمة.
- context: السياق المقترح (formal, casual, business).`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: text.slice(0, 3000),
        maxTokens: 1500,
        temperature: 0.4,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_translate");

      // ═══ Step 4: Validate translation + clean alternatives ═══
      const data = result.data || {};
      const translation = String(data.translation || "").trim();
      if (!translation) {
        return {
          success: false,
          error: "GLM ما رجّعش ترجمة",
          data: { steps_completed: stepsCompleted },
        };
      }

      const alternatives = Array.isArray(data.alternatives)
        ? data.alternatives.map((a: any) => String(a)).filter((a: string) => a.length > 0)
        : [];
      stepsCompleted.push("validate_translation");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "language_translator_pro",
          source_text: text.slice(0, 500),
          from,
          to,
          detected: fromRaw === "auto" || !fromRaw,
          translation,
          cultural_notes: String(data.cultural_notes || ""),
          alternatives,
          literal_translation: String(data.literal_translation || ""),
          context: String(data.context || ""),
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
