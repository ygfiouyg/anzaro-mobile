/**
 * MCP Tool: Text Statistics
 * إحصائيات تفصيلية عن نص (محلي).
 */
import type { MCPTool } from "../types";

export const textStatsTool: MCPTool = {
  name: "text_stats",
  description: "إحصائيات تفصيلية عن نص (محلي). استخدمها لما المستخدم يقول 'text stats' أو 'إحصائيات نص'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للتحليل" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 100000) return { success: false, error: "النص طويل جداً" };

    try {
      const chars = Array.from(text);
      const words = text.trim().split(/\s+/).filter(Boolean);
      const sentences = text.split(/[.!?؟\n]+/).filter((s) => s.trim().length > 0);
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

      // character distribution
      const upper = (text.match(/[A-Z]/g) || []).length;
      const lower = (text.match(/[a-z]/g) || []).length;
      const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
      const digits = (text.match(/[0-9]/g) || []).length;
      const spaces = (text.match(/\s/g) || []).length;
      const punctuation = (text.match(/[.,!?;:'"()\-–—…،؛؟«»]/g) || []).length;
      const special = (text.match(/[@#$%^&*+=<>{}[\]|\\\/`~]/g) || []).length;

      // word lengths
      const wordLengths = words.map((w) => Array.from(w).length);
      const avgWordLength = wordLengths.length > 0 ? wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length : 0;
      const maxWordLength = Math.max(...wordLengths, 0);
      const minWordLength = wordLengths.length > 0 ? Math.min(...wordLengths) : 0;

      // sentence lengths
      const sentenceLengths = sentences.map((s) => s.trim().split(/\s+/).filter(Boolean).length);
      const avgSentenceLength = sentenceLengths.length > 0 ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length : 0;
      const maxSentenceLength = Math.max(...sentenceLengths, 0);

      // most common letters
      const letterFreq: Record<string, number> = {};
      for (const ch of text.toLowerCase()) {
        if (/[a-z\u0600-\u06ff]/.test(ch)) {
          letterFreq[ch] = (letterFreq[ch] || 0) + 1;
        }
      }
      const topLetters = Object.entries(letterFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([letter, count]) => ({ letter, count }));

      // readability (rough)
      const readability = calcReadability(text, words.length, sentences.length, chars.length);

      return {
        success: true,
        data: {
          totals: {
            characters: chars.length,
            characters_no_spaces: chars.filter((c) => !/\s/.test(c)).length,
            words: words.length,
            sentences: sentences.length,
            paragraphs: paragraphs.length,
            lines: text.split("\n").length,
          },
          character_distribution: {
            uppercase: upper,
            lowercase: lower,
            arabic: arabic,
            digits: digits,
            spaces: spaces,
            punctuation: punctuation,
            special: special,
            other: chars.length - upper - lower - arabic - digits - spaces - punctuation - special,
          },
          word_stats: {
            avg_length: Math.round(avgWordLength * 10) / 10,
            max_length: maxWordLength,
            min_length: minWordLength,
            longest_word: words.reduce((longest, w) => Array.from(w).length > Array.from(longest).length ? w : longest, ""),
          },
          sentence_stats: {
            avg_length: Math.round(avgSentenceLength * 10) / 10,
            max_length: maxSentenceLength,
          },
          top_letters: topLetters,
          readability,
          estimated_reading_time_min: Math.ceil(words.length / 200),
          estimated_speaking_time_min: Math.ceil(words.length / 130),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function calcReadability(text: string, words: number, sentences: number, chars: number): any {
  if (words === 0 || sentences === 0) return { score: 0, level: "Unknown" };

  // Flesch Reading Ease (English approximation)
  const syllables = countSyllables(text);
  const fleschScore = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);

  let level: string;
  if (fleschScore >= 90) level = "سهل جداً (5th grade)";
  else if (fleschScore >= 80) level = "سهل (6th grade)";
  else if (fleschScore >= 70) level = "سهل إلى حد ما (7th grade)";
  else if (fleschScore >= 60) level: level = "عادي (8-9th grade)";
  else if (fleschScore >= 50) level = "عادي إلى صعب (10-12th grade)";
  else if (fleschScore >= 30) level = "صعب (College)";
  else level = "صعب جداً (College graduate)";

  return {
    flesch_score: Math.round(fleschScore * 10) / 10,
    level,
    syllables_estimated: syllables,
  };
}

function countSyllables(text: string): number {
  // rough estimate
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const word of words) {
    const matches = word.match(/[aeiouy]+/g);
    total += matches ? matches.length : 1;
  }
  return total;
}
