/**
 * MCP Tool: Vector Store Upsert
 * n8n: "Upsert huge documents in a vector store with Supabase and Notion"
 * 
 * إصلاح: استخدم in-memory store بدل UserMemory (مش محتاج foreign key)
 */
import type { MCPTool } from "../types";
import { setItem, getAllItems } from "../memory-store";

export const vectorStoreUpsertTool: MCPTool = {
  name: "vector_store_upsert",
  description: "خزّن مستندات في vector store محلي + بحث تشابه (سيناريو متكامل). استخدمها لما المستخدم يقول 'خزّن مستندات' أو 'vector store' أو 'index documents'.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "upsert أو search (افتراضي: upsert)", default: "upsert" },
      documents: { type: "string", description: "لـ upsert: المستندات (كل واحد في سطر)" },
      query: { type: "string", description: "لـ search: نص البحث" },
      userId: { type: "string", description: "ID المستخدم (اختياري)", default: "default" },
    },
    required: ["action"],
  },
  async execute(params) {
    const action = String(params.action || "upsert").toLowerCase();
    const userId = String(params.userId || "default");
    const namespace = `vector_store_${userId}`;

    try {
      if (action === "upsert") {
        const docsText = String(params.documents || "").trim();
        if (!docsText) return { success: false, error: "documents مطلوبة لـ upsert" };
        const docs = docsText.split(/\n/).map((d) => d.trim()).filter((d) => d.length > 10).slice(0, 50);
        if (docs.length === 0) return { success: false, error: "مفيش مستندات صالحة" };

        // شكّل متجهات (TF-IDF مبسط — keywords)
        const stored: any[] = [];
        for (let i = 0; i < docs.length; i++) {
          const doc = docs[i];
          const words = doc.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const freq: Record<string, number> = {};
          words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
          const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);

          // خزّن في in-memory store (بدون foreign key)
          setItem(namespace, `doc_${i}`, { text: doc.slice(0, 500), keywords, index: i });
          stored.push({ index: i, preview: doc.slice(0, 60), keywords_count: keywords.length });
        }

        return {
          success: true,
          data: {
            scenario: "vector_store_upsert",
            action: "upsert",
            documents_stored: stored.length,
            steps: { tokenize: true, vectorize: true, store: stored.length > 0 },
            stored,
          },
        };

      } else if (action === "search") {
        const query = String(params.query || "").trim();
        if (!query) return { success: false, error: "query مطلوبة لـ search" };

        // استرجع من in-memory store
        const allItems = getAllItems(namespace);
        if (allItems.length === 0) return { success: false, error: "مفيش مستندات مخزنة. استخدم action=upsert أولاً." };

        // ابحث بالتشابه
        const qWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const results = allItems.map((item) => {
          const parsed = item.value;
          const matches = qWords.filter((w) => parsed.keywords?.includes(w)).length;
          const score = qWords.length > 0 ? matches / qWords.length : 0;
          return { text: parsed.text || "", index: parsed.index || 0, score: Math.round(score * 100) / 100, matches };
        }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

        return {
          success: true,
          data: {
            scenario: "vector_store_upsert",
            action: "search",
            query,
            total_documents: allItems.length,
            steps: { retrieve: allItems.length > 0, search: results.length > 0 },
            results: results.slice(0, 5),
            top_match: results[0] || null,
          },
        };
      }

      return { success: false, error: `action مش معروف: ${action}. استخدم upsert أو search` };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
