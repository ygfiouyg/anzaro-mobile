/**
 * MCP Tool — Translate
 * ====================
 * ترجمة نص بأي لغة إلى لغة هدف باستخدام GLM-5.2.
 *
 * الـ GLM بيحدد لغة المصدر تلقائيًا، فمش محتاجين sourceLanguage.
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";

const SUPPORTED_LANGS = [
  "ar", "en", "fr", "es", "de", "it", "ru", "zh", "ja", "ko",
  "tr", "fa", "ur", "hi", "pt", "nl", "pl", "id",
];

export const translateTool: MCPTool = {
  name: "translate",
  description:
    "Translate text from any source language into a target language using GLM-5.2. Source language is auto-detected. Can also be used as a free-form content generator by asking for a specific output style.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to translate.",
      },
      targetLanguage: {
        type: "string",
        description: "Target language code (e.g. 'ar', 'en', 'fr', 'es').",
        default: "ar",
      },
      sourceLanguage: {
        type: "string",
        description: "Optional source language code. Auto-detected if omitted.",
      },
    },
    required: ["text", "targetLanguage"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    const targetLanguage = String(params.targetLanguage || "ar").toLowerCase().trim();
    const sourceLanguage = params.sourceLanguage
      ? String(params.sourceLanguage).toLowerCase().trim()
      : undefined;

    if (!text) {
      return { success: false, error: "text مطلوبة" };
    }
    if (!SUPPORTED_LANGS.includes(targetLanguage)) {
      return { success: false, error: `targetLanguage غير مدعومة: ${targetLanguage}` };
    }

    try {
      const client = await getZAIClient();
      const langNames: Record<string, string> = {
        ar: "Arabic", en: "English", fr: "French", es: "Spanish", de: "German",
        it: "Italian", ru: "Russian", zh: "Chinese", ja: "Japanese", ko: "Korean",
        tr: "Turkish", fa: "Persian", ur: "Urdu", hi: "Hindi", pt: "Portuguese",
        nl: "Dutch", pl: "Polish", id: "Indonesian",
      };
      const targetName = langNames[targetLanguage] || targetLanguage;

      const systemPrompt = sourceLanguage
        ? `You are a professional translator. Translate the user's text from ${langNames[sourceLanguage] || sourceLanguage} to ${targetName}. Return only the translation — no explanations, no quotes.`
        : `You are a professional translator. Auto-detect the source language and translate the user's text to ${targetName}. Return only the translation — no explanations, no quotes.`;

      const completion = await client.chat.completions.create({
        model: "glm-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: Math.max(512, text.length * 4),
      });

      const translation: string =
        completion?.choices?.[0]?.message?.content?.trim() || "";

      if (!translation) {
        return { success: false, error: "الـ GLM رجّع ترجمة فارغة" };
      }

      return {
        success: true,
        data: {
          text,
          sourceLanguage: sourceLanguage || "auto",
          targetLanguage,
          translation,
          chars: translation.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: `فشل الترجمة: ${e.message}` };
    }
  },
};
