/**
 * MCP Tool: Readability Score
 * حساب readability scores متعددة (محلي).
 */
import type { MCPTool } from "../types";

export const readabilityScoreTool: MCPTool = {
  name: "readability_score",
  description: "حساب readability scores متعددة (محلي). استخدمها لما المستخدم يقول 'readability' أو 'سهولة القراءة'.",
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
    if (text.length > 50000) return { success: false, error: "النص طويل جداً" };

    try {
      const words = text.trim().split(/\s+/).filter(Boolean);
      const sentences = text.split(/[.!?؟]+/).filter((s) => s.trim().length > 0);
      const syllables = countTotalSyllables(text);
      const characters = text.replace(/\s/g, "").length;
      const complexWords = countComplexWords(words);

      const wordCount = words.length;
      const sentenceCount = Math.max(1, sentences.length);

      // Flesch Reading Ease
      const flesch = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / Math.max(1, wordCount));

      // Flesch-Kincaid Grade Level
      const fk = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / Math.max(1, wordCount)) - 15.59;

      // Gunning Fog Index
      const fog = 0.4 * ((wordCount / sentenceCount) + 100 * (complexWords / Math.max(1, wordCount)));

      // SMOG Index
      const smog = 1.0430 * Math.sqrt(complexWords * (30 / sentenceCount)) + 3.1291;

      // Coleman-Liau Index
      const L = (characters / Math.max(1, wordCount)) * 100;
      const S = (sentenceCount / Math.max(1, wordCount)) * 100;
      const colemanLiau = 0.0588 * L - 0.296 * S - 15.8;

      // Automated Readability Index
      const ari = 4.71 * (characters / Math.max(1, wordCount)) + 0.5 * (wordCount / sentenceCount) - 21.43;

      const avgScore = (fk + fog + smog + colemanLiau + ari) / 5;

      return {
        success: true,
        data: {
          text_stats: {
            words: wordCount,
            sentences: sentenceCount,
            syllables,
            characters,
            complex_words: complexWords,
            avg_words_per_sentence: Math.round((wordCount / sentenceCount) * 10) / 10,
            avg_syllables_per_word: Math.round((syllables / Math.max(1, wordCount)) * 100) / 100,
          },
          scores: {
            flesch_reading_ease: {
              score: Math.round(flesch * 10) / 10,
              level: fleschLevel(flesch),
              range: "0-100 (أعلى = أسهل)",
            },
            flesch_kincaid_grade: {
              score: Math.round(fk * 10) / 10,
              grade: `${Math.round(fk)}`,
              description: `مستوى صف ${Math.round(fk)}`,
            },
            gunning_fog: {
              score: Math.round(fog * 10) / 10,
              grade: `${Math.round(fog)}`,
              description: `مستوى صف ${Math.round(fog)}`,
            },
            smog: {
              score: Math.round(smog * 10) / 10,
              grade: `${Math.round(smog)}`,
              description: `مستوى صف ${Math.round(smog)}`,
            },
            coleman_liau: {
              score: Math.round(colemanLiau * 10) / 10,
              grade: `${Math.round(colemanLiau)}`,
              description: `مستوى صف ${Math.round(colemanLiau)}`,
            },
            automated_readability: {
              score: Math.round(ari * 10) / 10,
              grade: `${Math.round(ari)}`,
              description: `مستوى صف ${Math.round(ari)}`,
            },
          },
          average_grade_level: Math.round(avgScore * 10) / 10,
          average_reading_age: Math.round(avgScore + 5),
          recommendation: getRecommendation(avgScore),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function countSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function countTotalSyllables(text: string): number {
  return text.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + countSyllables(w), 0);
}

function countComplexWords(words: string[]): number {
  return words.filter((w) => countSyllables(w) >= 3).length;
}

function fleschLevel(score: number): string {
  if (score >= 90) return "سهل جداً (5th grade)";
  if (score >= 80) return "سهل (6th grade)";
  if (score >= 70) return "سهل (7th grade)";
  if (score >= 60) return "عادي (8-9th grade)";
  if (score >= 50) return "عادي (10-12th grade)";
  if (score >= 30) return "صعب (College)";
  return "صعب جداً (Graduate)";
}

function getRecommendation(grade: number): string {
  if (grade < 6) return "مناسب للأطفال";
  if (grade < 9) return "مناسب للمراهقين";
  if (grade < 12) return "مناسب للبالغين";
  if (grade < 16) return "مناسب لخريجي الجامعة";
  return "مناسب للمتخصصين";
}
