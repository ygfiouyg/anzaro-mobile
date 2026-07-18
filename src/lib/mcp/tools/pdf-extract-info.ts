/**
 * MCP Tool: PDF Extract Info
 * n8n: "Extract and process information directly from PDF using Claude and Gemini"
 * 
 * إصلاح: قلل maxTokens إلى 600 + قلل input إلى 2000
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const pdfExtractInfoTool: MCPTool = {
  name: "pdf_extract_info",
  description: "استخراج معلومات من نص PDF + تصنيف + تلخيص (سيناريو متكامل). استخدمها لما المستخدم يقول 'استخرج من PDF' أو 'حلل مستند'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "نص المستند (المستخرج من PDF)" },
      extractFields: { type: "string", description: "الحقول المطلوب استخراجها (مفصولة بفواصل، اختياري)" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    const fields = String(params.extractFields || "").trim();
    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length < 50) return { success: false, error: "النص قصير جداً" };

    try {
      const extraction = await callGLMForJSON({
        systemPrompt: `حلل المستند ده.${fields ? ` استخرج: ${fields}` : ""}
رجّع JSON:
{
  "document_type": "invoice|contract|report|letter|article|other",
  "title": "",
  "summary": "",
  "extracted_fields": {},
  "entities": {"names":[],"dates":[],"amounts":[]}
}`,
        userMessage: text.slice(0, 2000),
        maxTokens: 500,
        temperature: 0.1,
      });

      const r = extraction.data || {};

      return {
        success: true,
        data: {
          scenario: "pdf_extract_info",
          text_length: text.length,
          steps: { classify: !!r.document_type, extract: !!r.extracted_fields, summarize: !!r.summary },
          document_type: r.document_type || "other",
          title: r.title || "",
          summary: r.summary || "",
          extracted_fields: r.extracted_fields || {},
          entities: r.entities || {},
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
