/**
 * MCP Tool: Character Counter
 * بيعدّ الحروف والكلمات والأسطر والفقرات.
 * محلي — بدون API.
 */
import type { MCPTool } from "../types";

export const charCounterTool: MCPTool = {
  name: "char_counter",
  description: "عدّ الحروف والكلمات والأسطر (محلي). استخدمها لما المستخدم يقول 'عدّ الحروف' أو 'character count' أو 'كم كلمة'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للعدّ" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 500000) return { success: false, error: "النص طويل جداً" };

    try {
      const chars = Array.from(text); // يدعم emojis
      const charCount = chars.length;
      const charsNoSpaces = chars.filter((c) => !/\s/.test(c)).length;
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const sentences = text.split(/[.!?؟]+/).filter((s) => s.trim().length > 0).length;
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
      const lines = text.split("\n").length;
      const linesNonEmpty = text.split("\n").filter((l) => l.trim().length > 0).length;

      // spaces
      const spaces = (text.match(/ /g) || []).length;
      const tabs = (text.match(/\t/g) || []).length;
      const newlines = (text.match(/\n/g) || []).length;
      const totalWhitespace = spaces + tabs + newlines;

      // letters, digits, symbols
      const letters = (text.match(/[a-zA-Z\u0600-\u06FF]/g) || []).length;
      const digits = (text.match(/[0-9]/g) || []).length;
      const punctuation = (text.match(/[.,!?;:'"()\-–—…]/g) || []).length;
      const symbols = (text.match(/[@#$%^&*+=<>{}[\]|\\\/`~]/g) || []).length;
      const emojis = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{2600}-\u{27BF}]/gu) || []).length;

      // reading time (avg 200 wpm)
      const readingTimeMin = Math.ceil(words / 200);
      const speakingTimeMin = Math.ceil(words / 130); // avg speaking 130 wpm

      // longest word
      const allWords = text.trim().split(/\s+/).filter(Boolean);
      const longestWord = allWords.reduce((longest, w) => w.length > longest.length ? w : longest, "");

      return {
        success: true,
        data: {
          characters: charCount,
          characters_no_spaces: charsNoSpaces,
          words,
          sentences,
          paragraphs,
          lines,
          lines_non_empty: linesNonEmpty,
          spaces,
          tabs,
          newlines,
          total_whitespace: totalWhitespace,
          letters,
          digits,
          punctuation,
          symbols,
          emojis,
          reading_time_minutes: readingTimeMin,
          speaking_time_minutes: speakingTimeMin,
          longest_word: longestWord,
          longest_word_length: longestWord.length,
          avg_word_length: words > 0 ? Math.round((charsNoSpaces / words) * 10) / 10 : 0,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
