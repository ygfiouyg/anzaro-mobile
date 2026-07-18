/**
 * MCP Tool: Palindrome Checker
 * بيتحقق لو النص palindrome (محلي).
 */
import type { MCPTool } from "../types";

export const palindromeCheckTool: MCPTool = {
  name: "palindrome_check",
  description: "تحقق إذا كان النص palindrome (محلي). استخدمها لما المستخدم يقول 'palindrome' أو 'متناظر'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للفحص" },
      ignoreCase: { type: "boolean", description: "تجاهل حالة الأحرف (افتراضي: true)", default: true },
      ignoreSpaces: { type: "boolean", description: "تجاهل المسافات (افتراضي: true)", default: true },
      ignorePunctuation: { type: "boolean", description: "تجاهل علامات الترقيم (افتراضي: true)", default: true },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    if (!text) return { success: false, error: "text مطلوب" };

    const ignoreCase = params.ignoreCase !== false;
    const ignoreSpaces = params.ignoreSpaces !== false;
    const ignorePunctuation = params.ignorePunctuation !== false;

    try {
      let cleaned = text;

      if (ignoreCase) cleaned = cleaned.toLowerCase();
      if (ignoreSpaces) cleaned = cleaned.replace(/\s+/g, "");
      if (ignorePunctuation) {
        // remove punctuation (Arabic + English)
        cleaned = cleaned.replace(/[.,!?;:'"()\-–—…،؛؟«»\[\]{}@#$%^&*+=<>|\\/`~]/g, "");
      }

      // remove diacritics (Arabic tashkeel)
      cleaned = cleaned.replace(/[\u064B-\u065F\u0670]/g, "");

      const reversed = Array.from(cleaned).reverse().join("");
      const isPalindrome = cleaned === reversed;

      // find palindromic substrings
      const substrings: string[] = [];
      const chars = Array.from(cleaned);
      for (let i = 0; i < chars.length; i++) {
        for (let j = i + 2; j <= chars.length; j++) {
          const sub = chars.slice(i, j).join("");
          if (sub === sub.split("").reverse().join("") && sub.length > 1) {
            substrings.push(sub);
          }
        }
      }
      const uniqueSubstrings = [...new Set(substrings)].sort((a, b) => b.length - a.length);

      return {
        success: true,
        data: {
          original: text,
          cleaned,
          reversed,
          is_palindrome: isPalindrome,
          length: cleaned.length,
          options: { ignoreCase, ignoreSpaces, ignorePunctuation },
          palindromic_substrings: uniqueSubstrings.slice(0, 20),
          longest_palindromic_substring: uniqueSubstrings[0] || null,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
