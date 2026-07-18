/**
 * MCP Tool: Multi LLM Tester
 * النواة الصلبة #7: "Local Multi-LLM Testing & Performance Tracker"
 * 
 * الخطوات:
 * 1. اقبل سؤال + عدد المحاولات
 * 2. اسأل GLM نفس السؤال عدة مرات
 * 3. قارن الإجابات → اتساق + جودة + سرعة
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";

export const multiLlmTesterTool: MCPTool = {
  name: "multi_llm_tester",
  description: "اختبار تكرار LLM — اسأل نفس السؤال عدة مرات + قارن (سيناريو متكامل). استخدمها لما المستخدم يقول 'اختبر النموذج' أو 'LLM test' أو 'اتساق'.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "السؤال/الـ prompt" },
      runs: { type: "number", description: "عدد المحاولات (افتراضي: 3، أقصى: 5)", default: 3 },
      model: { type: "string", description: "النموذج (افتراضي: glm-5.2)", default: "glm-5.2" },
      temperature: { type: "number", description: "درجة الحرارة (افتراضي: 0.7)", default: 0.7 },
    },
    required: ["prompt"],
  },
  async execute(params) {
    const prompt = String(params.prompt || "").trim();
    const runs = Math.min(5, Math.max(2, Number(params.runs) || 3));
    const model = String(params.model || "glm-5.2");
    const temperature = Math.min(2, Math.max(0, Number(params.temperature) || 0.7));
    if (!prompt) return { success: false, error: "prompt مطلوب" };

    try {
      const zai = await getZAIClient();
      const results: any[] = [];
      const responses: string[] = [];

      // ═══ الخطوة 1: اسأل نفس السؤال عدة مرات ═══
      for (let i = 0; i < runs; i++) {
        const start = Date.now();
        try {
          const completion = await zai.chat.completions.create({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
            temperature,
          });
          const response = completion?.choices?.[0]?.message?.content || "";
          const duration = Date.now() - start;
          results.push({ run: i + 1, response, duration_ms: duration, tokens: response.split(/\s+/).length });
          responses.push(response);
        } catch (e: any) {
          results.push({ run: i + 1, response: "", duration_ms: Date.now() - start, error: e.message });
          responses.push("");
        }
      }

      // ═══ الخطوة 2: تحليل الاتساق ═══
      // حساب التشابه بين الإجابات
      let consistencyScore = 0;
      if (responses.length >= 2) {
        let totalSimilarity = 0;
        let comparisons = 0;
        for (let i = 0; i < responses.length; i++) {
          for (let j = i + 1; j < responses.length; j++) {
            // Jaccard similarity بسيط
            const words1 = new Set(responses[i].toLowerCase().split(/\s+/));
            const words2 = new Set(responses[j].toLowerCase().split(/\s+/));
            const intersection = [...words1].filter((w) => words2.has(w)).length;
            const union = new Set([...words1, ...words2]).size;
            totalSimilarity += union > 0 ? intersection / union : 0;
            comparisons++;
          }
        }
        consistencyScore = comparisons > 0 ? Math.round((totalSimilarity / comparisons) * 100) : 0;
      }

      // إحصائيات
      const validResults = results.filter((r) => r.response);
      const durations = validResults.map((r) => r.duration_ms);
      const tokenCounts = validResults.map((r) => r.tokens);

      return {
        success: true,
        data: {
          scenario: "multi_llm_tester",
          prompt: prompt.slice(0, 200),
          model,
          temperature,
          runs,
          steps: {
            execute_runs: results.length,
            measure_performance: durations.length > 0,
            analyze_consistency: true,
          },
          results,
          analysis: {
            consistency_score: consistencyScore,
            consistency_level: consistencyScore > 80 ? "عالي" : consistencyScore > 50 ? "متوسط" : "منخفض",
            avg_duration_ms: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
            min_duration_ms: durations.length > 0 ? Math.min(...durations) : 0,
            max_duration_ms: durations.length > 0 ? Math.max(...durations) : 0,
            avg_tokens: tokenCounts.length > 0 ? Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length) : 0,
            all_identical: consistencyScore === 100,
            unique_responses: new Set(responses).size,
          },
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
