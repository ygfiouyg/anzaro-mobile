/**
 * MCP Tool: Trivia Questions
 * تكامل حقيقي مع Open Trivia DB API (مجاني، بدون API key).
 * بيرجّع أسئلة trivial pursuit.
 */
import type { MCPTool } from "../types";

export const triviaQuestionsTool: MCPTool = {
  name: "trivia_questions",
  description: "أسئلة trivia عشوائية (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'trivia' أو 'أسئلة' أو 'مسابقة'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد الأسئلة (افتراضي: 5، أقصى: 50)", default: 5 },
      category: { type: "number", description: "ID التصنيف (9-32، اختياري)" },
      difficulty: { type: "string", description: "easy, medium, hard (اختياري)" },
      type: { type: "string", description: "boolean, multiple (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(50, Math.max(1, Number(params.count) || 5));
    const category = Number(params.category) || null;
    const difficulty = String(params.difficulty || "").toLowerCase().trim();
    const type = String(params.type || "").toLowerCase().trim();

    try {
      const params2 = new URLSearchParams();
      params2.set("amount", String(count));
      if (category) params2.set("category", String(category));
      if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
        params2.set("difficulty", difficulty);
      }
      if (type && ["boolean", "multiple"].includes(type)) {
        params2.set("type", type);
      }

      const url = `https://opentdb.com/api.php?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Open Trivia DB API error ${res.status}` };

      const data: any = await res.json();

      if (data.response_code !== 0) {
        const codes: Record<number, string> = {
          1: "مفيش نتائج كافية للمعايير دي",
          2: "معيار غير صالح",
          3: "Token غير موجود",
          4: "Token exhausting - كل الأسئلة اتباعتت",
        };
        return {
          success: false,
          error: codes[data.response_code] || `API response code: ${data.response_code}`,
        };
      }

      const questions = (data.results || []).map((q: any) => ({
        category: q.category || "",
        type: q.type || "",
        difficulty: q.difficulty || "",
        question: decodeHtml(q.question || ""),
        correct_answer: decodeHtml(q.correct_answer || ""),
        incorrect_answers: (q.incorrect_answers || []).map(decodeHtml),
        all_answers: type === "boolean"
          ? ["True", "False"]
          : shuffle([q.correct_answer, ...(q.incorrect_answers || [])].map(decodeHtml)),
      }));

      return {
        success: true,
        data: {
          count: questions.length,
          filters: {
            category: category || null,
            difficulty: difficulty || null,
            type: type || null,
          },
          questions,
          source: "opentdb.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é")
    .replace(/&aacute;/g, "á");
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
