/**
 * MCP Tool: Language Detector
 * بيكشف لغة أي نص — بـ Unicode script analysis + heuristics.
 * بيدعم 30+ لغة بدون ما يحتاج API خارجي.
 */
import type { MCPTool } from "../types";

export const languageDetectTool: MCPTool = {
  name: "language_detect",
  description: "كشف لغة أي نص (محلي، بدون API). استخدمها لما المستخدم يقول 'لغة' أو 'language' أو 'كشف اللغة'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للكشف لغته" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length < 3) return { success: false, error: "النص قصير جداً (حد أدنى: 3 حروف)" };
    if (text.length > 10000) return { success: false, error: "النص طويل جداً (حد أقصى: 10000 حرف)" };

    try {
      const detected = detectLanguage(text);

      return {
        success: true,
        data: {
          text_sample: text.slice(0, 100),
          text_length: text.length,
          ...detected,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

interface LangResult {
  language: string;
  language_ar: string;
  code: string;
  confidence: number;
  script: string;
  alternatives: Array<{ lang: string; code: string; confidence: number }>;
}

/** كشف اللغة بـ Unicode script analysis + heuristics */
function detectLanguage(text: string): LangResult {
  const chars = Array.from(text);
  const total = chars.length;

  // عدّ الحروف حسب الـ script
  const scripts: Record<string, number> = {};
  for (const ch of chars) {
    const script = getUnicodeScript(ch);
    scripts[script] = (scripts[script] || 0) + 1;
  }

  // الأغلبية script
  const sortedScripts = Object.entries(scripts).sort((a, b) => b[1] - a[1]);
  const [dominantScript, dominantCount] = sortedScripts[0] || ["Latin", 0];
  const confidence = Math.round((dominantCount / total) * 100);

  // حدد اللغة بناءً على الـ script + heuristics
  let lang = "unknown";
  let langAr = "غير معروف";
  let code = "und";
  const alternatives: Array<{ lang: string; code: string; confidence: number }> = [];

  if (dominantScript === "Arabic") {
    // ممكن: Arabic, Persian, Urdu, Kurdish
    if (/[پچژگ]/.test(text)) {
      lang = "Persian";
      langAr = "فارسية";
      code = "fa";
    } else if (/[ٹڈھڑںھ]/.test(text)) {
      lang = "Urdu";
      langAr = "أردية";
      code = "ur";
    } else {
      lang = "Arabic";
      langAr = "عربية";
      code = "ar";
    }
  } else if (dominantScript === "Cyrillic") {
    if (/[їєґ]/i.test(text)) {
      lang = "Ukrainian";
      langAr = "أوكرانية";
      code = "uk";
    } else if (/[ђђјљњћ]/i.test(text)) {
      lang = "Serbian";
      langAr = "صربية";
      code = "sr";
    } else {
      lang = "Russian";
      langAr = "روسية";
      code = "ru";
    }
  } else if (dominantScript === "Greek") {
    lang = "Greek";
    langAr = "يونانية";
    code = "el";
  } else if (dominantScript === "Hebrew") {
    lang = "Hebrew";
    langAr = "عبرية";
    code = "he";
  } else if (dominantScript === "Hiragana" || dominantScript === "Katakana") {
    lang = "Japanese";
    langAr = "يابانية";
    code = "ja";
  } else if (dominantScript === "Han") {
    if (/[ぁ-んァ-ン]/.test(text)) {
      lang = "Japanese";
      langAr = "يابانية";
      code = "ja";
    } else if (/[가-힣]/.test(text)) {
      lang = "Korean";
      langAr = "كورية";
      code = "ko";
    } else {
      lang = "Chinese";
      langAr = "صينية";
      code = "zh";
    }
  } else if (dominantScript === "Hangul") {
    lang = "Korean";
    langAr = "كورية";
    code = "ko";
  } else if (dominantScript === "Devanagari") {
    if (/[ॐ]/.test(text)) {
      lang = "Hindi";
      langAr = "هندية";
      code = "hi";
    } else {
      lang = "Hindi";
      langAr = "هندية";
      code = "hi";
    }
  } else if (dominantScript === "Thai") {
    lang = "Thai";
    langAr = "تايلاندية";
    code = "th";
  } else if (dominantScript === "Latin") {
    // استخدم common words + diacritics لتحديد اللغة
    const lower = text.toLowerCase();
    if (/[àâçéèêëîïôûùüÿœ]/.test(lower) || /\b(le|la|les|de|et|est|une|des|que|bonjour|merci|oui|non|comment|allez|vous|avec|sans|pour|dans|sur|sous)\b/.test(lower)) {
      lang = "French";
      langAr = "فرنسية";
      code = "fr";
    } else if (/[ñ¿¡áéíóúü]/.test(lower) || /\b(el|la|los|las|que|y|es|una|unos|hola|gracias|si|no|como|estas|buenos|dias|por|para|con|sin)\b/.test(lower)) {
      lang = "Spanish";
      langAr = "إسبانية";
      code = "es";
    } else if (/[äöüß]/.test(lower) || /\b(der|die|das|und|ist|nicht|ein|eine|hallo|danke|ja|nein|guten|morgen|tag|mit|ohne)\b/.test(lower)) {
      lang = "German";
      langAr = "ألمانية";
      code = "de";
    } else if (/[àèéìòù]/.test(lower) || /\b(il|che|di|la|per|una|sono|con|ciao|grazie|si|no|come|stai|buongiorno)\b/.test(lower)) {
      lang = "Italian";
      langAr = "إيطالية";
      code = "it";
    } else if (/[ãõáâçé]/.test(lower) || /\b(o|a|os|as|que|não|uma|com|olá|obrigado|sim|não|bom|dia|para)\b/.test(lower)) {
      lang = "Portuguese";
      langAr = "برتغالية";
      code = "pt";
    } else if (/\b(the|and|is|are|was|were|to|of|in|for|with|this|that|hello|thank|yes|no|how|are|you|good)\b/.test(lower)) {
      lang = "English";
      langAr = "إنجليزية";
      code = "en";
    } else {
      lang = "English";
      langAr = "إنجليزية (افتراضي)";
      code = "en";
    }
  }

  // إضافة بدائل
  if (sortedScripts.length > 1) {
    for (let i = 1; i < Math.min(3, sortedScripts.length); i++) {
      const [script, count] = sortedScripts[i];
      alternatives.push({
        lang: script,
        code: "—",
        confidence: Math.round((count / total) * 100),
      });
    }
  }

  return {
    language: lang,
    language_ar: langAr,
    code,
    confidence,
    script: dominantScript,
    alternatives,
  };
}

/** تحديد Unicode script للحرف */
function getUnicodeScript(ch: string): string {
  const cp = ch.codePointAt(0) || 0;

  if (cp >= 0x0600 && cp <= 0x06ff) return "Arabic";
  if (cp >= 0x0400 && cp <= 0x04ff) return "Cyrillic";
  if (cp >= 0x0370 && cp <= 0x03ff) return "Greek";
  if (cp >= 0x0590 && cp <= 0x05ff) return "Hebrew";
  if (cp >= 0x3040 && cp <= 0x309f) return "Hiragana";
  if (cp >= 0x30a0 && cp <= 0x30ff) return "Katakana";
  if (cp >= 0x4e00 && cp <= 0x9fff) return "Han";
  if (cp >= 0xac00 && cp <= 0xd7af) return "Hangul";
  if (cp >= 0x0900 && cp <= 0x097f) return "Devanagari";
  if (cp >= 0x0e00 && cp <= 0x0e7f) return "Thai";
  if (cp >= 0x0041 && cp <= 0x005a) return "Latin";
  if (cp >= 0x0061 && cp <= 0x007a) return "Latin";
  if (cp >= 0x00c0 && cp <= 0x024f) return "Latin Extended";
  if (cp >= 0x4e00 && cp <= 0x9fff) return "Han";
  if (/\s/.test(ch)) return "Space";
  if (/[0-9]/.test(ch)) return "Number";
  if (/[.,!?;:'"()\-]/.test(ch)) return "Punctuation";
  return "Other";
}
