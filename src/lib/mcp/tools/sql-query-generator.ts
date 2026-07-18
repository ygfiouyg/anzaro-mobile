/**
 * MCP Tool: SQL Query Generator
 * القسم 3 #3: "Generate SQL queries from schema only - AI-powered"
 * الخطوات: اقبل schema → ولّد SQL → اشرح
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const sqlQueryGeneratorTool: MCPTool = {
  name: "sql_query_generator",
  description: "ولّد SQL queries من schema + سؤال طبيعي (سيناريو متكامل). استخدمها لما المستخدم يقول 'SQL query' أو 'استعلام قاعدة بيانات'.",
  parameters: {
    type: "object",
    properties: {
      schema: { type: "string", description: "Schema الجداول (مثلاً: users(id, name, email), orders(id, user_id, total))" },
      question: { type: "string", description: "السؤال باللغة الطبيعية" },
      dialect: { type: "string", description: "نوع SQL: postgresql, mysql, sqlite (افتراضي: postgresql)", default: "postgresql" },
    },
    required: ["schema", "question"],
  },
  async execute(params) {
    const schema = String(params.schema || "").trim();
    const question = String(params.question || "").trim();
    const dialect = String(params.dialect || "postgresql").toLowerCase();
    if (!schema || !question) return { success: false, error: "schema و question مطلوبين" };
    try {
      const result = await callGLMForJSON({
        systemPrompt: `أنت خبير SQL. من schema: ${schema}
 dialect: ${dialect}
 السؤال: ${question}
 رجّع JSON: {"query":"","explanation":"","tables_used":[],"joins":[],"optimization_tip":""}`,
        userMessage: question,
        maxTokens: 400,
        temperature: 0.2,
      });
      const r = result.data || {};
      return { success: true, data: { scenario: "sql_query_generator", schema, dialect, question, steps: { parse_schema: true, generate: !!r.query, explain: !!r.explanation }, query: r.query || "", explanation: r.explanation || "", tables_used: r.tables_used || [], joins: r.joins || [], optimization_tip: r.optimization_tip || "" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
