/**
 * MCP Tool: Code Review
 * فكرة من: ChatGPT Automatic Code Review in Gitlab MR
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const codeReviewTool: MCPTool = {
  name: "code_review",
  description: "راجع كود واعطي ملاحظات. استخدمها لما المستخدم يقول 'راجع كود' أو 'code review'.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "الكود المراد مراجعته" },
      language: { type: "string", description: "لغة البرمجة (اختياري)", default: "" },
    },
    required: ["code"],
  },
  async execute(params) {
    const code = String(params.code || "");
    const language = String(params.language || "");
    if (!code) return { success: false, error: "code مطلوب" };
    try {
      const systemMsg = `راجع الكود التالي ${language ? "(" + language + ")" : ""} واعطي:

1. 🔍 Bug/Issues
2. ⚡ Performance
3. 🛡️ Security
4. 📐 Best Practices
5. 💡 Improvements
6. ⭐ Score (0-100)

رجّع JSON: {"bugs":[],"performance":[],"security":[],"bestPractices":[],"improvements":[],"score":0}

بالعربي.`;
      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: code.slice(0, 10000),
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
