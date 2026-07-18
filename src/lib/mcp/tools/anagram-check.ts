/**
 * MCP Tool: Anagram Checker
 * بيتحقق لو نصين anagrams (محلي).
 */
import type { MCPTool } from "../types";

export const anagramCheckTool: MCPTool = {
  name: "anagram_check",
  description: "تحقق إذا كان نصين anagrams (محلي). استخدمها لما المستخدم يقول 'anagram' أو 'تقاليب حروف'.",
  parameters: {
    type: "object",
    properties: {
      text1: { type: "string", description: "النص الأول" },
      text2: { type: "string", description: "النص الثاني" },
      ignoreCase: { type: "boolean", description: "تجاهل حالة الأحرف (افتراضي: true)", default: true },
      ignoreSpaces: { type: "boolean", description: "تجاهل المسافات (افتراضي: true)", default: true },
    },
    required: ["text1", "text2"],
  },
  async execute(params) {
    const text1 = String(params.text1 || "");
    const text2 = String(params.text2 || "");
    if (!text1 || !text2) return { success: false, error: "text1 و text2 مطلوبين" };

    const ignoreCase = params.ignoreCase !== false;
    const ignoreSpaces = params.ignoreSpaces !== false;

    try {
      let s1 = text1;
      let s2 = text2;

      if (ignoreCase) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
      }
      if (ignoreSpaces) {
        s1 = s1.replace(/\s+/g, "");
        s2 = s2.replace(/\s+/g, "");
      }

      // remove diacritics
      s1 = s1.replace(/[\u064B-\u065F\u0670]/g, "");
      s2 = s2.replace(/[\u064B-\u065F\u0670]/g, "");

      // sort characters
      const sorted1 = Array.from(s1).sort().join("");
      const sorted2 = Array.from(s2).sort().join("");

      const isAnagram = sorted1 === sorted2;

      // character frequency
      const freq1 = getCharFrequency(s1);
      const freq2 = getCharFrequency(s2);

      // differences
      const allChars = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);
      const differences: any[] = [];
      for (const ch of allChars) {
        const f1 = freq1[ch] || 0;
        const f2 = freq2[ch] || 0;
        if (f1 !== f2) {
          differences.push({ char: ch, in_text1: f1, in_text2: f2, diff: f1 - f2 });
        }
      }

      return {
        success: true,
        data: {
          text1: text1.slice(0, 200),
          text2: text2.slice(0, 200),
          is_anagram: isAnagram,
          sorted_text1: sorted1,
          sorted_text2: sorted2,
          length1: s1.length,
          length2: s2.length,
          char_frequency_1: freq1,
          char_frequency_2: freq2,
          differences,
          options: { ignoreCase, ignoreSpaces },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function getCharFrequency(text: string): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const ch of text) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  return freq;
}
