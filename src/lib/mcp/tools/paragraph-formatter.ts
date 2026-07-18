/**
 * MCP Tool: Paragraph Formatter
 * تنسيق فقرات نص (محلي).
 */
import type { MCPTool } from "../types";

export const paragraphFormatterTool: MCPTool = {
  name: "paragraph_formatter",
  description: "تنسيق فقرات نص (محلي). استخدمها لما المستخدم يقول 'format paragraphs' أو 'نسّق فقرات'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للتنسيق" },
      action: {
        type: "string",
        description: "merge, split, trim, capitalize, indent, bullet, number (افتراضي: trim)",
        default: "trim",
      },
      indentSize: { type: "number", description: "حجم المسافة البادئة (افتراضي: 4)", default: 4 },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const action = String(params.action || "trim").toLowerCase();
    const indentSize = Math.min(20, Math.max(0, Number(params.indentSize) || 4));

    if (!text) return { success: false, error: "text مطلوب" };

    try {
      let result: string;

      switch (action) {
        case "merge":
          // دمج كل الفقرات في فقرة واحدة
          result = text.replace(/\n\s*\n+/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
          break;

        case "split":
          // تقسيم لفقرات كل جملة في فقرة
          const sentences = text.split(/(?<=[.!?؟])\s+/).filter((s) => s.trim());
          result = sentences.join("\n\n");
          break;

        case "trim":
          // تنظيف الفقرات (إزالة المسافات الزائدة)
          result = text
            .split(/\n\s*\n/)
            .map((p) => p.replace(/\s+/g, " ").trim())
            .filter((p) => p.length > 0)
            .join("\n\n");
          break;

        case "capitalize":
          // capitalize أول حرف من كل فقرة
          result = text
            .split(/\n\s*\n/)
            .map((p) => {
              const trimmed = p.trim();
              return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
            })
            .join("\n\n");
          break;

        case "indent":
          // إضافة مسافة بادئة لكل فقرة
          const indent = " ".repeat(indentSize);
          result = text
            .split(/\n\s*\n/)
            .map((p) => indent + p.trim().replace(/\n/g, "\n" + indent))
            .join("\n\n");
          break;

        case "bullet":
          // تحويل الفقرات لـ bullet points
          result = text
            .split(/\n\s*\n/)
            .map((p) => `• ${p.trim()}`)
            .join("\n\n");
          break;

        case "number":
          // تحويل الفقرات لقائمة مرقمة
          result = text
            .split(/\n\s*\n/)
            .map((p, i) => `${i + 1}. ${p.trim()}`)
            .join("\n\n");
          break;

        default:
          return { success: false, error: `action غير معروف: ${action}` };
      }

      // stats
      const originalParagraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
      const resultParagraphs = result.split(/\n\s*\n/).filter((p) => p.trim()).length;

      return {
        success: true,
        data: {
          action,
          original: text.slice(0, 500),
          original_length: text.length,
          original_paragraphs: originalParagraphs,
          result: result.slice(0, 20000),
          result_length: result.length,
          result_paragraphs: resultParagraphs,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
