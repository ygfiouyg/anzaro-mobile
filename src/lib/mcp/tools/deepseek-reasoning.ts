/**
 * MCP Tool: DeepSeek Reasoning
 * n8n: "DeepSeek V3 Chat & R1 Reasoning Quick Start"
 * 
 * إصلاح: قلل maxTokens إلى 500 + بسّط prompt
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const deepseekReasoningTool: MCPTool = {
  name: "deepseek_reasoning",
  description: "تفكير منطقي متعدد الخطوات — reasoning + إجابة (سيناريو متكامل). استخدمها لما المستخدم يقول 'فكر خطوة بخطوة' أو 'reasoning' أو 'حلل منطقياً'.",
  parameters: {
    type: "object",
    properties: {
      problem: { type: "string", description: "المشكلة/السؤال" },
      domain: { type: "string", description: "المجال: math, logic, code, general (افتراضي: general)", default: "general" },
    },
    required: ["problem"],
  },
  async execute(params) {
    const problem = String(params.problem || "").trim();
    const domain = String(params.domain || "general").toLowerCase();
    if (!problem) return { success: false, error: "problem مطلوب" };

    try {
      const reasoning = await callGLMForJSON({
        systemPrompt: `حل المشكلة خطوة بخطوة. المجال: ${domain}.
رجّع JSON:
{
  "understanding": "فهم المشكلة في سطر",
  "steps": [{"step":1,"thought":"التفكير","result":"النتيجة"}],
  "final_answer": "الإجابة النهائية"
}`,
        userMessage: problem.slice(0, 500),
        maxTokens: 500,
        temperature: 0.3,
      });

      const r = reasoning.data || {};

      return {
        success: true,
        data: {
          scenario: "deepseek_reasoning",
          problem: problem.slice(0, 200),
          domain,
          steps: {
            understand: !!r.understanding,
            execute: (r.steps || []).length > 0,
            answer: !!r.final_answer,
          },
          understanding: r.understanding || "",
          reasoning_steps: r.steps || [],
          final_answer: r.final_answer || "",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
