/**
 * MCP Tool: Vector Data Analysis
 * النواة الصلبة #5: "Vector Database as a Big Data Analysis Tool for AI Agents"
 * 
 * الخطوات:
 * 1. اقبل مجموعة بيانات نصية
 * 2. شكّل متجهات (TF-IDF مبسط)
 * 3. اكتشف anomalies + clusters
 * 4. حلل بالـ AI
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const vectorDataAnalysisTool: MCPTool = {
  name: "vector_data_analysis",
  description: "تحليل بيانات بالمتجهات — TF-IDF + anomalies + clusters (سيناريو متكامل). استخدمها لما المستخدم يقول 'تحليل بيانات' أو 'vector analysis' أو 'anomaly detection'.",
  parameters: {
    type: "object",
    properties: {
      data: { type: "string", description: "البيانات (كل عنصر في سطر)" },
      analysisType: { type: "string", description: "نوع: anomaly, similarity, cluster (افتراضي: all)", default: "all" },
    },
    required: ["data"],
  },
  async execute(params) {
    const dataText = String(params.data || "").trim();
    const analysisType = String(params.analysisType || "all").toLowerCase();
    if (!dataText) return { success: false, error: "data مطلوبة" };
    try {
      // 1) قسّم البيانات
      const items = dataText.split(/\n/).map((s) => s.trim()).filter((s) => s.length > 5).slice(0, 50);
      if (items.length < 2) return { success: false, error: "تحتاج على الأقل 2 عناصر" };

      // 2) TF-IDF مبسط — حساب تكرار الكلمات
      const wordFreq: Record<string, number[]> = {};
      items.forEach((item, idx) => {
        const words = item.toLowerCase().split(/\s+/);
        const seen = new Set<string>();
        words.forEach((w) => {
          if (w.length > 3 && !seen.has(w)) {
            if (!wordFreq[w]) wordFreq[w] = new Array(items.length).fill(0);
            wordFreq[w][idx] = 1;
            seen.add(w);
          }
        });
      });

      // 3) اكتشف anomalies (عناصر مختلفة جداً)
      const similarities: any[] = [];
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          let intersection = 0, union = 0;
          for (const w in wordFreq) {
            if (wordFreq[w][i] || wordFreq[w][j]) {
              union++;
              if (wordFreq[w][i] && wordFreq[w][j]) intersection++;
            }
          }
          const sim = union > 0 ? intersection / union : 0;
          similarities.push({ item1: i, item2: j, similarity: Math.round(sim * 100) / 100 });
        }
      }

      // متوسط التشابه لكل عنصر
      const avgSim: number[] = items.map((_, i) => {
        const sims = similarities.filter((s) => s.item1 === i || s.item2 === i).map((s) => s.similarity);
        return sims.length > 0 ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
      });

      const anomalies = items.map((item, i) => ({ item, index: i, avg_similarity: Math.round(avgSim[i] * 100) / 100 }))
        .filter((a) => a.avg_similarity < 0.15)
        .sort((a, b) => a.avg_similarity - b.avg_similarity);

      // 4) AI تحليل
      const aiAnalysis = await callGLMForJSON({
        systemPrompt: `حلل البيانات دي (${items.length} عنصر). الـ anomalies المرشحة: ${anomalies.map((a) => a.item.slice(0, 50)).join("، ")}
رجّع JSON: {"summary":"","patterns":[],"anomalies_explained":[],"recommendations":[]}`,
        userMessage: items.slice(0, 10).join("\n"), maxTokens: 500, temperature: 0.3,
      });

      return { success: true, data: { scenario: "vector_data_analysis", total_items: items.length, analysis_type: analysisType, steps: { tokenize: true, compute_similarity: similarities.length > 0, detect_anomalies: true, ai_analysis: !!aiAnalysis.data?.summary }, stats: { avg_similarity: Math.round((avgSim.reduce((a, b) => a + b, 0) / avgSim.length) * 100) / 100, anomalies_count: anomalies.length, unique_words: Object.keys(wordFreq).length }, anomalies: anomalies.slice(0, 5), top_similarities: [...similarities].sort((a, b) => b.similarity - a.similarity).slice(0, 5), ai_analysis: aiAnalysis.data || {} } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
