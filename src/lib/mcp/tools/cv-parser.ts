/**
 * MCP Tool: CV/Resume Parser
 * فكرة من: CV Resume PDF Parsing + AI Automated HR Workflow
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const cvParserTool: MCPTool = {
  name: "cv_parser",
  description: "حلل سيرة ذاتية/CV واستخرج البيانات. استخدمها لما المستخدم يقول 'حلل CV' أو 'سيرة ذاتية'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "نص السيرة الذاتية" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    if (!text) return { success: false, error: "text مطلوب" };
    try {
      const systemMsg = `حلل السيرة الذاتية ورجّع JSON:
{
  "name": "", "email": "", "phone": "", "skills": [],
  "experience": [{"company":"","role":"","years":""}],
  "education": [{"degree":"","institution":""}],
  "languages": [], "summary": "", "strengths": [], "weaknesses": []
}`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: text.slice(0, 10000),
        maxTokens: 2000,
        temperature: 0.3,
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
