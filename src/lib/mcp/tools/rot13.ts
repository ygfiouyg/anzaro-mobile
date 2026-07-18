/**
 * MCP Tool: ROT13 Cipher
 * تطبيق ROT13 cipher (محلي).
 */
import type { MCPTool } from "../types";

export const rot13Tool: MCPTool = {
  name: "rot13",
  description: "تطبيق ROT13 cipher (محلي). استخدمها لما المستخدم يقول 'rot13' أو 'ROT13'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص" },
      rotation: { type: "number", description: "مقدار الدوران (افتراضي: 13، نطاق: 1-25)", default: 13 },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    let rotation = Number(params.rotation) || 13;
    rotation = ((rotation % 26) + 26) % 26;

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 100000) return { success: false, error: "النص طويل جداً" };

    try {
      const result = applyRotation(text, rotation);

      return {
        success: true,
        data: {
          original: text.slice(0, 500),
          rotation,
          result,
          note: rotation === 13 ? "ROT13 هو تشفير ذاتي عكسي (apply مرتين = النص الأصلي)" : null,
          original_length: text.length,
          result_length: result.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function applyRotation(text: string, rotation: number): string {
  let result = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);

    if (code >= 65 && code <= 90) {
      result += String.fromCharCode(((code - 65 + rotation) % 26) + 65);
    } else if (code >= 97 && code <= 122) {
      result += String.fromCharCode(((code - 97 + rotation) % 26) + 97);
    } else {
      result += ch;
    }
  }
  return result;
}
