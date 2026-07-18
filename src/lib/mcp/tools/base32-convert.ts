/**
 * MCP Tool: Base32 Converter
 * encode/decode Base32 (محلي).
 */
import type { MCPTool } from "../types";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32ConvertTool: MCPTool = {
  name: "base32_convert",
  description: "encode/decode Base32 (محلي). استخدمها لما المستخدم يقول 'base32' أو 'encode base32'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للمعالجة" },
      action: { type: "string", description: "encode أو decode (افتراضي: encode)", default: "encode" },
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

      if (action === "encode") {
        result = encodeBase32(text);
      } else if (action === "decode") {
        try {
          result = decodeBase32(text);
        } catch (e: any) {
          return { success: false, error: `فشل decode: ${e.message}` };
        }
      } else {
        return { success: false, error: `action غير معروف: ${action}` };
      }

      return {
        success: true,
        data: {
          action,
          input: text.slice(0, 200),
          input_length: text.length,
          result: result.slice(0, 20000),
          result_length: result.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function encodeBase32(text: string): string {
  const bytes = Buffer.from(text, "utf-8");
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 0x1F];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1F];
  }

  // padding to multiple of 8
  while (result.length % 8 !== 0) {
    result += "=";
  }

  return result;
}

function decodeBase32(text: string): string {
  const cleaned = text.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of cleaned) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx === -1) {
      throw new Error(`حرف غير صالح: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xFF);
      bits -= 8;
    }
  }

  return Buffer.from(bytes).toString("utf-8");
}
