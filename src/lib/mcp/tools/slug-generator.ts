/**
 * MCP Tool: Slug Generator
 * بيولّد URL-safe slugs من أي نص (محلي).
 * بيدعم: Arabic transliteration, custom separators, lowercase.
 */
import type { MCPTool } from "../types";

export const slugGeneratorTool: MCPTool = {
  name: "slug_generator",
  description: "ولّد URL-safe slugs من نص (محلي). استخدمها لما المستخدم يقول 'slug' أو 'url slug' أو 'رابط صديق'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للتحويل" },
      separator: { type: "string", description: "الفاصل (افتراضي: -)", default: "-" },
      lowercase: { type: "boolean", description: "تحويل لـ lowercase (افتراضي: true)", default: true },
      transliterate: { type: "boolean", description: "تحويل الحروف غير اللاتينية (افتراضي: true)", default: true },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const separator = String(params.separator || "-") || "-";
    const lowercase = params.lowercase !== false;
    const transliterate = params.transliterate !== false;

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 1000) return { success: false, error: "النص طويل جداً (حد 1000 حرف)" };

    try {
      let slug = text;

      // 1) transliterate Arabic + other scripts
      if (transliterate) {
        slug = transliterateText(slug);
      }

      // 2) lowercase
      if (lowercase) {
        slug = slug.toLowerCase();
      }

      // 3) استبدل أي حرف غير alphanumeric بالفاصل
      slug = slug.replace(/[^a-zA-Z0-9]+/g, separator);

      // 4) شيل الفواصل من البداية والنهاية
      slug = slug.replace(new RegExp(`^\\${separator}+|\\${separator}+$`, "g"), "");

      // 5) شيل الفواصل المتكررة
      slug = slug.replace(new RegExp(`\\${separator}{2,}`, "g"), separator);

      // multiple slugs for variations
      const variations: string[] = [slug];
      if (separator !== "-") {
        const dashVersion = slug.split(separator).join("-");
        if (dashVersion !== slug) variations.push(dashVersion);
      }
      if (separator !== "_") {
        const underscoreVersion = slug.split(separator).join("_");
        if (underscoreVersion !== slug) variations.push(underscoreVersion);
      }

      return {
        success: true,
        data: {
          original: text,
          slug,
          separator,
          lowercase,
          transliterate,
          length: slug.length,
          words_count: slug.split(separator).filter(Boolean).length,
          is_valid: /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(slug),
          variations: variations.slice(0, 5),
          url_example: `https://example.com/${slug}`,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

/** تحويل الحروف غير اللاتينية لحروف لاتينية */
function transliterateText(text: string): string {
  const arabicMap: Record<string, string> = {
    "أ": "a", "إ": "i", "آ": "a", "ا": "a", "ب": "b", "ت": "t", "ث": "th",
    "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
    "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
    "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
    "ه": "h", "و": "w", "ي": "y", "ى": "a", "ئ": "y", "ة": "h", "ء": "",
    "ؤ": "w",
  };

  const germanMap: Record<string, string> = {
    "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
    "Ä": "Ae", "Ö": "Oe", "Ü": "Ue",
  };

  const frenchMap: Record<string, string> = {
    "à": "a", "â": "a", "ç": "c", "é": "e", "è": "e", "ê": "e", "ë": "e",
    "î": "i", "ï": "i", "ô": "o", "û": "u", "ù": "u", "ü": "u", "ÿ": "y",
    "À": "A", "Â": "A", "Ç": "C", "É": "E", "È": "E", "Ê": "E", "Ë": "E",
  };

  const spanishMap: Record<string, string> = {
    "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n", "ü": "u",
    "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ñ": "N",
  };

  let result = text;

  // Arabic
  for (const [ar, en] of Object.entries(arabicMap)) {
    result = result.split(ar).join(en);
  }

  // German
  for (const [de, en] of Object.entries(germanMap)) {
    result = result.split(de).join(en);
  }

  // French
  for (const [fr, en] of Object.entries(frenchMap)) {
    result = result.split(fr).join(en);
  }

  // Spanish
  for (const [es, en] of Object.entries(spanishMap)) {
    result = result.split(es).join(en);
  }

  return result;
}
