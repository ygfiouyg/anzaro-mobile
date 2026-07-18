/**
 * MCP Tool: Document RAG Chat
 * القسم 2 #5: "RAG Chatbot for Company Documents using Google Drive and Gemini"
 * 
 * الخطوات:
 * 1. اقبل مجموعة مستندات (نصوص)
 * 2. شكّل فهرس بسيط (keywords per document)
 * 3. ابحث عن المستند الأكثر صلة بالسؤال
 * 4. جاوب + استشهد بالمستند
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const documentRagChatTool: MCPTool = {
  name: "document_rag_chat",
  description: "شات مع مجموعة مستندات — يبحث + يجاوب + يستشهد (سيناريو متكامل). استخدمها لما المستخدم يقول 'شات مع مستندات' أو 'company documents'.",
  parameters: {
    type: "object",
    properties: {
      documents: { type: "string", description: "المستندات (كل مستند مفصول بـ ===)" },
      question: { type: "string", description: "السؤال" },
    },
    required: ["documents", "question"],
  },
  async execute(params) {
    const docsText = String(params.documents || "").trim();
    const question = String(params.question || "").trim();
    if (!docsText || !question) return { success: false, error: "documents و question مطلوبين" };

    try {
      // 1) قسّم المستندات
      const docs = docsText.split(/\n?===\n?/).map((d) => d.trim()).filter((d) => d.length > 20);
      if (docs.length === 0) return { success: false, error: "مفيش مستندات صالحة" };

      // 2) فهرس بسيط — keywords لكل مستند
      const indexed = docs.map((doc, i) => {
        const words = doc.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        const freq: Record<string, number> = {};
        words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
        const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
        return { index: i, preview: doc.slice(0, 100), keywords, fullText: doc };
      });

      // 3) ابحث عن الأكثر صلة
      const qWords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const scored = indexed.map((doc) => {
        const matches = qWords.filter((w) => doc.keywords.includes(w)).length;
        return { ...doc, relevanceScore: matches / Math.max(qWords.length, 1) };
      });
      scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const topDoc = scored[0];

      // 4) RAG — جاوب من المستند الأكثر صلة
      const result = await callGLMForJSON({
        systemPrompt: `أنت نظام RAG. عندك مستند مرجعي + سؤال.
جاوب من المستند بس. لو المعلومة مش موجودة، قول.

المستند: ${topDoc.fullText.slice(0, 2000)}

رجّع JSON: {"answer":"","citation":"من المستند ${topDoc.index + 1}","confidence":"","missing_info":""}`,
        userMessage: question,
        maxTokens: 500,
        temperature: 0.2,
      });

      return {
        success: true,
        data: {
          scenario: "document_rag_chat",
          question,
          documents_count: docs.length,
          steps: { index: true, search: true, generate: !!result.data?.answer },
          retrieved_document: { index: topDoc.index + 1, preview: topDoc.preview, relevance: Math.round(topDoc.relevanceScore * 100) + "%" },
          answer: result.data?.answer || "تعذر توليد الإجابة",
          citation: result.data?.citation || "",
          confidence: result.data?.confidence || "low",
          missing_info: result.data?.missing_info || "",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
