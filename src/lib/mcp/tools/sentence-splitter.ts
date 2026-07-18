/**
 * MCP Tool: Sentence Splitter
 * تقسيم نص لجمل (محلي).
 */
import type { MCPTool } from "../types";

export const sentenceSplitterTool: MCPTool = {
  name: "sentence_splitter",
  description: "تقسيم نص لجمل (محلي). استخدمها لما المستخدم يقول 'split sentences' أو 'قسّم جمل'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للتقسيم" },
      keepPunctuation: { type: "boolean", description: "احتفظ بعلامات الترقيم (افتراضي: true)", default: true },
      minLength: { type: "number", description: "أقل طول للجملة (افتراضي: 0)", default: 0 },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const keepPunctuation = params.keepPunctuation !== false;
    const minLength = Math.max(0, Number(params.minLength) || 0);

    if (!text) return { success: false, error: "text مطلوب" };

    try {
      // تقسيم مع الحفاظ على العلامات
      const rawSentences: string[] = [];
      let current = "";

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        current += ch;

        // sentence enders: . ! ? ؟ ؛
        if (/[.!?؟]/.test(ch)) {
          // check if next char is space or end (not decimal like 3.14)
          const next = text[i + 1];
          if (!next || /\s/.test(next) || /[.!?؟]/.test(next)) {
            rawSentences.push(current.trim());
            current = "";
          }
        }
      }

      if (current.trim()) {
        rawSentences.push(current.trim());
      }

      // process
      let sentences = rawSentences
        .filter((s) => s.length > 0)
        .filter((s) => !keepPunctuation || s.replace(/[.!?؟]+$/, "").length >= minLength);

      if (!keepPunctuation) {
        sentences = sentences.map((s) => s.replace(/[.!?؟]+$/, "").trim());
      }

      const stats = {
        total_sentences: sentences.length,
        avg_length: sentences.length > 0 ? Math.round(sentences.reduce((s, str) => s + str.length, 0) / sentences.length) : 0,
        longest: sentences.reduce((longest, s) => s.length > longest.length ? s : longest, ""),
        shortest: sentences.reduce((shortest, s) => s.length < shortest.length ? s : shortest, sentences[0] || ""),
      };

      return {
        success: true,
        data: {
          sentences,
          count: sentences.length,
          stats,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
