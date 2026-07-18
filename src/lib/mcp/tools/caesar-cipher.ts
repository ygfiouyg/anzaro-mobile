/**
 * MCP Tool: Caesar Cipher
 * تشفير/فك تشفير Caesar cipher (محلي).
 */
import type { MCPTool } from "../types";

export const caesarCipherTool: MCPTool = {
  name: "caesar_cipher",
  description: "تشفير/فك تشفير Caesar cipher (محلي). استخدمها لما المستخدم يقول 'caesar' أو 'تشفير قيصر'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص" },
      shift: { type: "number", description: "مقدار الإزاحة (1-25)" },
      action: { type: "string", description: "encrypt أو decrypt (افتراضي: encrypt)", default: "encrypt" },
    },
    required: ["text", "shift"],
  },
  async execute(params) {
    const text = String(params.text || "");
    let shift = Number(params.shift) || 0;
    const action = String(params.action || "encrypt").toLowerCase();

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 50000) return { success: false, error: "النص طويل جداً" };

    try {
      // normalize shift
      shift = ((shift % 26) + 26) % 26;
      if (action === "decrypt") shift = -shift;

      const result = applyCaesar(text, shift);

      // brute force: show all 25 alternatives
      const bruteForce: any[] = [];
      for (let s = 1; s < 26; s++) {
        const decoded = applyCaesar(text, s);
        if (decoded !== text) {
          bruteForce.push({ shift: s, result: decoded.slice(0, 100) });
        }
      }

      return {
        success: true,
        data: {
          original: text.slice(0, 500),
          shift: Math.abs(shift),
          action,
          result,
          original_length: text.length,
          brute_force: action === "decrypt" ? bruteForce.slice(0, 25) : null,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function applyCaesar(text: string, shift: number): string {
  let result = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);

    // Uppercase
    if (code >= 65 && code <= 90) {
      result += String.fromCharCode(((code - 65 + shift + 26) % 26) + 65);
    }
    // Lowercase
    else if (code >= 97 && code <= 122) {
      result += String.fromCharCode(((code - 97 + shift + 26) % 26) + 97);
    }
    // Arabic (basic shift)
    else if (code >= 0x0621 && code <= 0x064A) {
      result += String.fromCharCode(((code - 0x0621 + shift + 28) % 28) + 0x0621);
    }
    // keep as-is
    else {
      result += ch;
    }
  }
  return result;
}
