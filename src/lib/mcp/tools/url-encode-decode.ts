/**
 * MCP Tool: URL Encode/Decode
 * encode/decode URL components (محلي).
 */
import type { MCPTool } from "../types";

export const urlEncodeDecodeTool: MCPTool = {
  name: "url_encode_decode",
  description: "encode/decode URL components (محلي). استخدمها لما المستخدم يقول 'url encode' أو 'percent encoding'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للمعالجة" },
      action: {
        type: "string",
        description: "encode, decode, encode_component, decode_component (افتراضي: encode)",
        default: "encode",
      },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const action = String(params.action || "encode").toLowerCase();

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 100000) return { success: false, error: "النص طويل جداً" };

    try {
      let result: string;

      switch (action) {
        case "encode":
          result = encodeURI(text);
          break;
        case "decode":
          try {
            result = decodeURI(text);
          } catch (e: any) {
            return { success: false, error: `فشل decode: ${e.message}` };
          }
          break;
        case "encode_component":
        case "encodecomponent":
          result = encodeURIComponent(text);
          break;
        case "decode_component":
        case "decodecomponent":
          try {
            result = decodeURIComponent(text);
          } catch (e: any) {
            return { success: false, error: `فشل decode: ${e.message}` };
          }
          break;
        default:
          return { success: false, error: `action غير معروف: ${action}. جرّب: encode, decode, encode_component, decode_component` };
      }

      // encoded chars analysis
      const encodedChars: any[] = [];
      if (action.startsWith("encode")) {
        const diff = result.length - text.length;
        const matches = result.match(/%[0-9A-Fa-f]{2}/g) || [];
        const uniqueEncoded = [...new Set(matches)];
        uniqueEncoded.slice(0, 20).forEach((m) => {
          const code = parseInt(m.slice(1), 16);
          encodedChars.push({
            encoded: m,
            char: String.fromCharCode(code),
            code: code,
          });
        });
      }

      return {
        success: true,
        data: {
          action,
          input: text.slice(0, 200),
          input_length: text.length,
          result: result.slice(0, 50000),
          result_length: result.length,
          size_diff: result.length - text.length,
          encoded_chars_count: (result.match(/%[0-9A-Fa-f]{2}/g) || []).length,
          unique_encoded_chars: encodedChars,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
