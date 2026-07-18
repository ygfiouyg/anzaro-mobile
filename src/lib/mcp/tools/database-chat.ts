/**
 * MCP Tool: Database Chat
 * القسم 3 #1: "Chat with Postgresql Database"
 * الخطوات: اقبل schema + سؤال → ولّد SQL → اشرح النتائج المتوقعة
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const databaseChatTool: MCPTool = {
  name: "database_chat",
  description: "شات مع قاعدة بيانات — ولّد SQL + اشرح + اقترح (سيناريو متكامل). استخدمها لما المستخدم يقول 'شات مع DB' أو 'database query'.",
  parameters: {
    type: "object",
    properties: {
      schema: { type: "string", description: "Schema الجداول" },
      question: { type: "string", description: "السؤال" },
      sampleData: { type: "string", description: "بيانات تجريبية (اختياري)" },
    },
    required: ["schema", "question"],
  },
  async execute(params) {
    const schema = String(params.schema || "").trim();
    const question = String(params.question || "").trim();
    const sampleData = String(params.sampleData || "").trim();
    if (!schema || !question) return { success: false, error: "schema و question مطلوبين" };
    try {
      const result = await callGLMForJSON({
        systemPrompt: `أنت مساعد قواعد بيانات. Schema: ${schema}
${sampleData ? `بيانات تجريبية: ${sampleData.slice(0, 500)}` : ""}
السؤال: ${question}
رجّع JSON: {"sql":"","expected_columns":[],"explanation":"","alternative_queries":[],"performance_note":""}`,
        userMessage: question,
        maxTokens: 400,
        temperature: 0.2,
      });
      const r = result.data || {};
      return { success: true, data: { scenario: "database_chat", question, steps: { parse: true, generate: !!r.sql, explain: !!r.explanation }, sql: r.sql || "", expected_columns: r.expected_columns || [], explanation: r.explanation || "", alternative_queries: r.alternative_queries || [], performance_note: r.performance_note || "" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
