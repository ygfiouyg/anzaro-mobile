/**
 * MCP Tool: PDF Chat
 * ===================
 * فكرة من: Chat with PDF docs using AI
 * يحلل PDF ويجاوب على أسئلة عنه
 */

import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const pdfChatTool: MCPTool = {
  name: "pdf_chat",
  description: "حلل PDF/text واجاوب على أسئلة عنه. استخدمها لما المستخدم يرفع ملف أو يلصق نص طويل.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "نص المستند (أو محتوى PDF المستخرج)",
      },
      question: {
        type: "string",
        description: "السؤال عن المستند",
      },
    },
    required: ["text", "question"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const question = String(params.question || "");
    if (!text || !question) return { success: false, error: "text و question مطلوبين" };

    try {
      const result = await callGLMForJSON({
        systemPrompt: `أنت مساعد ذكي بيحلل المستندات. المستخدم هيعطيك نص ويسألك سؤال.

القواعد:
1. ابحث في النص عن الإجابة
2. لو لقيتها، ارد بدقة مع اقتباس
3. لو ملقتش، قول "مفيش معلومات عن ده في المستند"
4. اعمل ملخص قصير كمان

النص:
${text.slice(0, 15000)}

رجّع JSON فقط:
{
  "answer": "الإجابة الكاملة على السؤال (مع اقتباس لو متاح)",
  "summary": "ملخص قصير للمستند",
  "found_in_document": true
}`,
        userMessage: question,
        maxTokens: 2000,
        temperature: 0.3,
      });

      if (result.success) {
        return {
          success: true,
          data: {
            question,
            ...result.data,
            documentLength: text.length,
          },
        };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
