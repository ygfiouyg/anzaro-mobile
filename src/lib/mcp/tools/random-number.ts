/**
 * MCP Tool: Random Number Generator
 * بيولّد أرقام عشوائية بخيارات (محلي).
 */
import type { MCPTool } from "../types";
import { randomBytes } from "crypto";

export const randomNumberTool: MCPTool = {
  name: "random_number",
  description: "ولّد أرقام عشوائية (محلي). استخدمها لما المستخدم يقول 'رقم عشوائي' أو 'random number'.",
  parameters: {
    type: "object",
    properties: {
      min: { type: "number", description: "أقل قيمة (افتراضي: 1)", default: 1 },
      max: { type: "number", description: "أعلى قيمة (افتراضي: 100)", default: 100 },
      count: { type: "number", description: "عدد الأرقام (افتراضي: 1، أقصى: 1000)", default: 1 },
      unique: { type: "boolean", description: "أرقام فريدة فقط (افتراضي: false)", default: false },
      decimals: { type: "number", description: "عدد الخانات العشرية (افتراضي: 0)", default: 0 },
    },
    required: [],
  },
  async execute(params) {
    const min = Number(params.min ?? 1);
    const max = Number(params.max ?? 100);
    const count = Math.min(1000, Math.max(1, Number(params.count) || 1));
    const unique = Boolean(params.unique);
    const decimals = Math.min(10, Math.max(0, Number(params.decimals) || 0));

    if (min >= max) return { success: false, error: "min لازم أقل من max" };
    if (unique && (max - min) < count) {
      return { success: false, error: `مفيش ${count} رقم فريد بين ${min} و ${max}` };
    }

    try {
      const numbers: number[] = [];
      const seen = new Set<number>();

      let attempts = 0;
      while (numbers.length < count && attempts < count * 100) {
        const num = generateSecureRandom(min, max, decimals);
        if (unique) {
          if (!seen.has(num)) {
            seen.add(num);
            numbers.push(num);
          }
        } else {
          numbers.push(num);
        }
        attempts++;
      }

      const sorted = [...numbers].sort((a, b) => a - b);

      return {
        success: true,
        data: {
          min,
          max,
          count: numbers.length,
          unique,
          decimals,
          numbers,
          sorted,
          min_value: Math.min(...numbers),
          max_value: Math.max(...numbers),
          average: Math.round((numbers.reduce((s, n) => s + n, 0) / numbers.length) * 1000) / 1000,
          sum: numbers.reduce((s, n) => s + n, 0),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function generateSecureRandom(min: number, max: number, decimals: number): number {
  const range = max - min;
  const bytes = randomBytes(8);
  const random = bytes.readUInt32BE(0) / 0xFFFFFFFF; // 0-1
  let result = min + random * range;
  if (decimals === 0) {
    result = Math.floor(result);
  } else {
    result = Math.round(result * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
  return result;
}
