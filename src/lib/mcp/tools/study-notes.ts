/**
 * MCP Tool: Study Notes Generator
 * فكرة من: "Breakdown Documents into Study Notes using Templating MistralAI and Qdrant"
 * بيحوّل أي محتوى/موضوع لملاحظات دراسية منظّمة.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const studyNotesTool: MCPTool = {
  name: "study_notes",
  description: "حوّل محتوى/موضوع لملاحظات دراسية منظّمة. استخدمها لما المستخدم يقول 'ملاحظات دراسية' أو 'study notes' أو 'ذاكر'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "الموضوع أو المحتوى" },
      level: { type: "string", description: "المستوى: beginner, intermediate, advanced", default: "intermediate" },
      format: { type: "string", description: "الصيغة: outline, cornell, qacards, mixed", default: "mixed" },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const level = String(params.level || "intermediate");
    const format = String(params.format || "mixed");
    if (!topic) return { success: false, error: "topic مطلوب" };
    try {
      const systemMsg = `أنت معلم محترف متخصص في عمل ملاحظات دراسية فعّالة.
حوّل الموضوع ده لملاحظات دراسية: "${topic}"
المستوى: ${level}. الصيغة: ${format}.

أوّل ملاحظاتك لازم تحتوي على:
- ملخص تنفيذي (3-5 أسطر)
- المفاهيم الأساسية (مع تعريف مختصر لكل واحد)
- نقاط مهمة للذاكرة (key takeaways)
- أمثلة عملية
- أسئلة للمراجعة (5-10 أسئلة)
- مصطلحات/mnemonics لو مناسب

${format === "cornell" ? "استخدم نظام Cornell: cues / notes / summary." : ""}
${format === "qacards" ? "استخدم بطاقات سؤال-جواب (Q&A flashcards)." : ""}

رجّع JSON فقط:
{"title":"","summary":"","key_concepts":[{"term":"","definition":""}],"takeaways":[],"examples":[],"review_questions":[],"mnemonics":[]}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: topic,
        maxTokens: 3500,
        temperature: 0.5,
      });
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
