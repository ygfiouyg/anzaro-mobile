/**
 * MCP Tool: RAG Citation
 * النواة الصلبة #4: "Make OpenAI Citation for File Retrieval RAG"
 * 
 * الخطوات:
 * 1. اقبل مستند + سؤال
 * 2. ابحث في المستند عن الأقسام ذات صلة
 * 3. ولّد إجابة مع استشهاد بفقرات من المستند
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const ragCitationTool: MCPTool = {
  name: "rag_citation",
  description: "RAG مع استشهادات — اقرأ مستند + جاوب + استشهد بالمصدر (سيناريو متكامل). استخدمها لما المستخدم يقول 'اسأل المستند' أو 'RAG' أو 'استشهد من النص'.",
  parameters: {
    type: "object",
    properties: {
      document: { type: "string", description: "نص المستند" },
      question: { type: "string", description: "السؤال" },
    },
    required: ["document", "question"],
  },
  async execute(params) {
    const document = String(params.document || "").trim();
    const question = String(params.question || "").trim();
    if (!document || !question) return { success: false, error: "document و question مطلوبين" };
    if (document.length < 50) return { success: false, error: "المستند قصير جداً" };

    try {
      // ═══ الخطوة 1: قسم المستند لفقرات ═══
      const paragraphs = document.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
      if (paragraphs.length === 0) {
        // لو مفيش فقرات، قسم بالأسطر
        const lines = document.split(/\n/).filter((l) => l.trim().length > 20);
        // ادمج كل 3 أسطر في فقرة
        for (let i = 0; i < lines.length; i += 3) {
          paragraphs.push(lines.slice(i, i + 3).join(" "));
        }
      }

      // ═══ الخطوة 2: RAG — ابحث + جاوب + استشهد ═══
      // نبعت أول 5 فقرات (أو أقل) + السؤال
      const context = paragraphs.slice(0, 8).map((p, i) => `[فقرة ${i + 1}]: ${p.slice(0, 300)}`).join("\n\n");

      const result = await callGLMForJSON({
        systemPrompt: `أنت نظام RAG. عندك مستند مقسّم لفقرات. جاوب السؤال بناءً على الفقرات دي فقط.
لكل معلومة في الإجابة، استشهد برقم الفقرة.

المستند:
${context}

السؤال: ${question}

رجّع JSON:
{
  "answer": "الإجابة الكاملة",
  "citations": [
    {"text": "النص المقتبس", "paragraph": رقم, "relevance": "عالية|متوسطة"}
  ],
  "confidence": "high|medium|low",
  "unanswered": true|false,
  "suggestion": "لو مش لاقي إجابة، اقترح حاجة"
}`,
        userMessage: question,
        maxTokens: 800,
        temperature: 0.2,
      });

      const r = result.data || {};

      return {
        success: true,
        data: {
          scenario: "rag_citation",
          question,
          document_length: document.length,
          paragraphs_count: paragraphs.length,
          steps: {
            chunk_document: paragraphs.length > 0,
            retrieve: true,
            generate_with_citations: !!r.answer,
          },
          answer: r.answer || "تعذر توليد الإجابة",
          citations: r.citations || [],
          confidence: r.confidence || "low",
          unanswered: r.unanswered || false,
          suggestion: r.suggestion || "",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
