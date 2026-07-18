/**
 * MCP Tool: String Case Converter
 * تحويل حالة النص (UPPER, lower, Title, camelCase, snake_case, kebab-case).
 * محلي — بدون API.
 */
import type { MCPTool } from "../types";

export const stringCaseTool: MCPTool = {
  name: "string_case",
  description: "تحويل حالة النص (محلي). استخدمها لما المستخدم يقول 'case' أو 'camelCase' أو 'snake_case' أو 'حالة نص'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للتحويل" },
      to: {
        type: "string",
        description: "الحالة: upper, lower, title, sentence, camel, pascal, snake, kebab, constant, dot, path",
      },
    },
    required: ["text", "to"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const to = String(params.to || "").toLowerCase().trim();

    if (!text) return { success: false, error: "text مطلوب" };
    if (!to) return { success: false, error: "to مطلوب" };
    if (text.length > 10000) return { success: false, error: "النص طويل جداً" };

    try {
      // split words من أي صيغة
      const words = splitWords(text);
      let result: string;

      switch (to) {
        case "upper":
        case "uppercase":
          result = text.toUpperCase();
          break;
        case "lower":
        case "lowercase":
          result = text.toLowerCase();
          break;
        case "title":
          result = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          break;
        case "sentence":
          result = text.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase());
          break;
        case "camel":
        case "camelcase":
          result = words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
          break;
        case "pascal":
        case "pascalcase":
          result = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
          break;
        case "snake":
        case "snake_case":
          result = words.map((w) => w.toLowerCase()).join("_");
          break;
        case "kebab":
        case "kebab-case":
          result = words.map((w) => w.toLowerCase()).join("-");
          break;
        case "constant":
        case "constant_case":
          result = words.map((w) => w.toUpperCase()).join("_");
          break;
        case "dot":
        case "dot_case":
          result = words.map((w) => w.toLowerCase()).join(".");
          break;
        case "path":
        case "path_case":
          result = words.map((w) => w.toLowerCase()).join("/");
          break;
        case "alternate":
          result = Array.from(text).map((ch, i) => i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()).join("");
          break;
        case "invert":
          result = Array.from(text).map((ch) => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()).join("");
          break;
        default:
          return { success: false, error: `حالة غير معروفة: ${to}. جرّب: upper, lower, title, camel, pascal, snake, kebab, constant, dot, path` };
      }

      return {
        success: true,
        data: {
          original: text.slice(0, 200),
          to,
          result: result.slice(0, 10000),
          original_length: text.length,
          result_length: result.length,
          word_count: words.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function splitWords(text: string): string[] {
  // أدخل مسافات قبل الحروف الكبيرة، استبدل الفواصل بمسافات
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-./\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
