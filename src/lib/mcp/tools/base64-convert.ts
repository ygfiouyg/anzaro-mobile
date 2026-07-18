/**
 * MCP Tool: Base64 Converter
 * encode/decode Base64 + URL safe Base64.
 * محلي — بدون API خارجي.
 */
import type { MCPTool } from "../types";

export const base64ConvertTool: MCPTool = {
  name: "base64_convert",
  description: "encode/decode Base64 (محلي). استخدمها لما المستخدم يقول 'base64' أو 'encode' أو 'decode'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للمعالجة" },
      action: {
        type: "string",
        description: "الإجراء: encode, decode, encode_urlsafe, decode_urlsafe (افتراضي: encode)",
        default: "encode",
      },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const action = String(params.action || "encode").toLowerCase();

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 100000) return { success: false, error: "النص طويل جداً (حد 100000 حرف)" };

    try {
      let result: string;
      let inputLength = text.length;
      let outputLength = 0;

      switch (action) {
        case "encode": {
          const buf = Buffer.from(text, "utf-8");
          result = buf.toString("base64");
          outputLength = result.length;
          break;
        }

        case "decode": {
          // شيل أي whitespace
          const cleaned = text.replace(/\s/g, "");
          try {
            const buf = Buffer.from(cleaned, "base64");
            result = buf.toString("utf-8");
            // تحقق إنه base64 صحيح
            const reEncoded = Buffer.from(result, "utf-8").toString("base64");
            if (reEncoded !== cleaned && reEncoded !== cleaned + "=" && reEncoded !== cleaned + "==") {
              // ليس base64 صالح
              return { success: false, error: "النص مش base64 صالح" };
            }
          } catch {
            return { success: false, error: "فشل decode base64" };
          }
          outputLength = result.length;
          break;
        }

        case "encode_urlsafe": {
          const buf = Buffer.from(text, "utf-8");
          result = buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          outputLength = result.length;
          break;
        }

        case "decode_urlsafe": {
          let cleaned = text.replace(/\s/g, "");
          // أضف padding لو ناقص
          while (cleaned.length % 4 !== 0) {
            cleaned += "=";
          }
          // استبدل URL-safe chars
          cleaned = cleaned.replace(/-/g, "+").replace(/_/g, "/");
          try {
            const buf = Buffer.from(cleaned, "base64");
            result = buf.toString("utf-8");
          } catch {
            return { success: false, error: "فشل decode base64 URL-safe" };
          }
          outputLength = result.length;
          break;
        }

        default:
          return { success: false, error: `إجراء غير معروف: ${action}. جرّب: encode, decode, encode_urlsafe, decode_urlsafe` };
      }

      return {
        success: true,
        data: {
          action,
          input: text.slice(0, 200),
          input_length: inputLength,
          result: result.slice(0, 10000), // حد للعرض
          result_length: outputLength,
          truncated: outputLength > 10000,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
