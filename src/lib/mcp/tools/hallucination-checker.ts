/**
 * MCP Tool: Hallucination Checker
 * n8n: "Detect hallucinations using specialised Ollama model bespoke-minicheck"
 * 
 * إصلاح: قلل maxTokens إلى 400 + بسّط prompt
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const hallucinationCheckerTool: MCPTool = {
  name: "hallucination_checker",
  description: "فاحص هلوسة AI — تحقق من صحة إجابة مقابل مصدر (سيناريو متكامل). استخدمها لما المستخدم يقول 'تحقق' أو 'هلوسة' أو 'fact check'.",
  parameters: {
    type: "object",
    properties: {
      claim: { type: "string", description: "الادعاء/الإجابة المراد فحصها" },
      source: { type: "string", description: "النص المرجعي (المصدر الصحيح)" },
    },
    required: ["claim", "source"],
  },
  async execute(params) {
    const claim = String(params.claim || "").trim();
    const source = String(params.source || "").trim();
    if (!claim || !source) return { success: false, error: "claim و source مطلوبين" };

    try {
      // 1) فحص أساسي (keyword match)
      const claimWords = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const sourceLower = source.toLowerCase();
      const matchedWords = claimWords.filter((w) => sourceLower.includes(w));
      const wordMatchRate = claimWords.length > 0 ? Math.round((matchedWords.length / claimWords.length) * 100) : 0;

      // 2) فحص بالـ AI — prompt قصير
      const result = await callGLMForJSON({
        systemPrompt: `فحص: الادعاء "${claim.slice(0, 200)}" مقابل المصدر "${source.slice(0, 800)}".
رجّع JSON: {"verdict":"supported|contradicted|insufficient","confidence":0-100,"evidence":[],"hallucinated_parts":[],"corrected_claim":""}`,
        userMessage: claim.slice(0, 200),
        maxTokens: 400,
        temperature: 0.1,
      });

      const r = result.data || {};

      return {
        success: true,
        data: {
          scenario: "hallucination_checker",
          claim: claim.slice(0, 200),
          source_length: source.length,
          steps: { keyword_match: true, ai_verification: !!r.verdict, extract_evidence: (r.evidence || []).length > 0 },
          preliminary: { word_match_rate: wordMatchRate, matched_keywords: matchedWords.slice(0, 10) },
          verdict: r.verdict || "insufficient",
          confidence: r.confidence || 0,
          evidence: r.evidence || [],
          hallucinated_parts: r.hallucinated_parts || [],
          corrected_claim: r.corrected_claim || "",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
