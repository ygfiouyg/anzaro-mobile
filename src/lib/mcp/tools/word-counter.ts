/**
 * MCP Tool: Word Counter & Analyzer
 * بيسجل الكلمات وتكرارها + إحصائيات (محلي).
 */
import type { MCPTool } from "../types";

export const wordCounterTool: MCPTool = {
  name: "word_counter",
  description: "عدّ وتحليل الكلمات في نص (محلي). استخدمها لما المستخدم يقول 'word frequency' أو 'تكرار الكلمات'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للتحليل" },
      topN: { type: "number", description: "عدد الكلمات الأكثر تكراراً (افتراضي: 20)", default: 20 },
      ignoreCase: { type: "boolean", description: "تجاهل حالة الأحرف (افتراضي: true)", default: true },
      ignoreStopWords: { type: "boolean", description: "تجاهل stop words (افتراضي: false)", default: false },
      minLength: { type: "number", description: "أقل طول للكلمة (افتراضي: 1)", default: 1 },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const topN = Math.min(500, Math.max(1, Number(params.topN) || 20));
    const ignoreCase = params.ignoreCase !== false;
    const ignoreStopWords = Boolean(params.ignoreStopWords);
    const minLength = Math.max(1, Number(params.minLength) || 1);

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 200000) return { success: false, error: "النص طويل جداً" };

    try {
      let words = text.split(/[\s\.,!?؛،؟"'()\-:;\n\r\t]+/).filter(Boolean);

      // process words
      if (ignoreCase) {
        words = words.map((w) => w.toLowerCase());
      }

      // remove diacritics
      words = words.map((w) => w.replace(/[\u064B-\u065F\u0670]/g, ""));

      // filter by length
      words = words.filter((w) => w.length >= minLength);

      // stop words
      if (ignoreStopWords) {
        words = words.filter((w) => !STOP_WORDS.has(w));
      }

      // frequency
      const freq: Record<string, number> = {};
      for (const w of words) {
        freq[w] = (freq[w] || 0) + 1;
      }

      // sort by frequency
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([word, count]) => ({ word, count, percentage: Math.round((count / words.length) * 1000) / 10 }));

      // stats
      const uniqueWords = Object.keys(freq).length;
      const totalWords = words.length;
      const totalChars = words.reduce((s, w) => s + w.length, 0);
      const avgLength = totalWords > 0 ? Math.round((totalChars / totalWords) * 10) / 10 : 0;

      // word length distribution
      const lengthDist: Record<number, number> = {};
      for (const w of words) {
        const len = w.length;
        lengthDist[len] = (lengthDist[len] || 0) + 1;
      }

      return {
        success: true,
        data: {
          total_words: totalWords,
          unique_words: uniqueWords,
          vocabulary_richness: totalWords > 0 ? Math.round((uniqueWords / totalWords) * 1000) / 10 : 0,
          avg_word_length: avgLength,
          total_characters: totalChars,
          top_words: sorted,
          word_length_distribution: lengthDist,
          longest_word: words.reduce((longest, w) => w.length > longest.length ? w : longest, ""),
          shortest_word: words.reduce((shortest, w) => w.length < shortest.length ? w : shortest, words[0] || ""),
          options: { ignoreCase, ignoreStopWords, minLength, topN },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

const STOP_WORDS = new Set([
  // English
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "up", "about", "into", "through", "during", "before", "after", "above", "below",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "this", "that", "these", "those",
  // Arabic
  "في", "من", "على", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "تلك", "هؤلاء", "التي", "الذي",
  "الذين", "هو", "هي", "هم", "هن", "نحن", "أنا", "أنت", "أنتم", "كان", "كانت", "يكون", "تكون",
  "قد", "لقد", "لم", "لن", "لا", "إن", "أن", "ما", "ماذا", "كيف", "متى", "أين", "لماذا",
  "و", "أو", "ثم", "لكن", "أي", "بعض", "كل", "غير", "بين", "عند", "عندما", "حتى", "لكي",
]);
