/**
 * MCP Tool: Binary Converter
 * تحويل بين binary, decimal, hex, octal, ASCII.
 * محلي — بدون API خارجي.
 */
import type { MCPTool } from "../types";

export const binaryConvertTool: MCPTool = {
  name: "binary_convert",
  description: "تحويل بين binary/decimal/hex/octal/ASCII (محلي). استخدمها لما المستخدم يقول 'binary' أو 'hex' أو 'decimal' أو 'octal'.",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "القيمة للتحويل" },
      from: {
        type: "string",
        description: "النظام المصدر: binary, decimal, hex, octal, ascii, text",
      },
    },
    required: ["value", "from"],
  },
  async execute(params) {
    const value = String(params.value || "");
    const from = String(params.from || "").toLowerCase().trim();

    if (!value) return { success: false, error: "value مطلوب" };
    if (!from) return { success: false, error: "from مطلوب" };

    try {
      // تحويل من المصدر لـ decimal الأول
      let decimal: number | null = null;
      let textValue: string | null = null;

      switch (from) {
        case "binary": {
          if (!/^[01\s]+$/.test(value)) {
            return { success: false, error: "binary لازم 0 و 1 فقط" };
          }
          const cleaned = value.replace(/\s/g, "");
          decimal = parseInt(cleaned, 2);
          if (isNaN(decimal)) {
            return { success: false, error: "binary غير صالح" };
          }
          break;
        }

        case "decimal": {
          const cleaned = value.trim();
          if (!/^-?\d+$/.test(cleaned)) {
            return { success: false, error: "decimal لازم أرقام فقط" };
          }
          decimal = parseInt(cleaned, 10);
          break;
        }

        case "hex":
        case "hexadecimal": {
          const cleaned = value.replace(/^0x/i, "").replace(/\s/g, "");
          if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
            return { success: false, error: "hex لازم 0-9 و a-f" };
          }
          decimal = parseInt(cleaned, 16);
          if (isNaN(decimal)) {
            return { success: false, error: "hex غير صالح" };
          }
          break;
        }

        case "octal": {
          const cleaned = value.replace(/\s/g, "");
          if (!/^[0-7]+$/.test(cleaned)) {
            return { success: false, error: "octal لازم 0-7 فقط" };
          }
          decimal = parseInt(cleaned, 8);
          if (isNaN(decimal)) {
            return { success: false, error: "octal غير صالح" };
          }
          break;
        }

        case "ascii":
        case "text": {
          textValue = value;
          // نحول كل حرف لـ decimal ونرجّع النتيجة
          const charCodes = Array.from(value).map((ch) => ch.charCodeAt(0));
          decimal = charCodes[0] || 0;
          break;
        }

        default:
          return { success: false, error: `نظام غير معروف: ${from}. جرّب: binary, decimal, hex, octal, ascii` };
      }

      if (decimal === null) {
        return { success: false, error: "فشل التحويل" };
      }

      // تحويل لكل الأنظمة
      const binary = decimal.toString(2);
      const hex = decimal.toString(16).toUpperCase();
      const octal = decimal.toString(8);

      // ASCII (لو في نطاق قابل للطباعة)
      const asciiChar = decimal >= 32 && decimal <= 126 ? String.fromCharCode(decimal) : null;

      // لو المدخل كان نص، نرجّع كل الحروف
      const textToBinary = textValue
        ? Array.from(textValue)
            .map((ch) => ch.charCodeAt(0).toString(2).padStart(8, "0"))
            .join(" ")
        : null;

      const textToHex = textValue
        ? Array.from(textValue)
            .map((ch) => ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
            .join(" ")
        : null;

      const textToDecimal = textValue
        ? Array.from(textValue).map((ch) => ch.charCodeAt(0))
        : null;

      return {
        success: true,
        data: {
          input: value.slice(0, 200),
          from,
          decimal,
          binary,
          hex,
          octal,
          ascii: asciiChar,
          ...(textValue
            ? {
                text_conversions: {
                  binary: textToBinary,
                  hex: textToHex,
                  decimal: textToDecimal,
                },
              }
            : {}),
          bit_count: binary.length,
          byte_count: Math.ceil(binary.length / 8),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
