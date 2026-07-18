/**
 * MCP Tool: Lottery Numbers
 * بيولّد أرقام يانصيب (محلي، آمن).
 * بيدعم أنواع: 6/49, 5/90, 5/39, Powerball, Mega Millions, EuroMillions.
 */
import type { MCPTool } from "../types";
import { randomBytes } from "crypto";

export const lotteryNumbersTool: MCPTool = {
  name: "lottery_numbers",
  description: "ولّد أرقام يانصيب (محلي). استخدمها لما المستخدم يقول 'يانصيب' أو 'lottery' أو 'أرقام حظ'.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "النوع: 6/49, 5/90, 5/39, powerball, mega, euro (افتراضي: 6/49)",
        default: "6/49",
      },
      count: { type: "number", description: "عدد التذاكر (افتراضي: 1، أقصى: 50)", default: 1 },
    },
    required: [],
  },
  async execute(params) {
    const type = String(params.type || "6/49").toLowerCase().trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 1));

    const formats: Record<string, { mainCount: number; mainMax: number; bonusCount: number; bonusMax: number; name: string }> = {
      "6/49": { mainCount: 6, mainMax: 49, bonusCount: 0, bonusMax: 0, name: "6/49" },
      "5/90": { mainCount: 5, mainMax: 90, bonusCount: 0, bonusMax: 0, name: "5/90" },
      "5/39": { mainCount: 5, mainMax: 39, bonusCount: 0, bonusMax: 0, name: "5/39" },
      powerball: { mainCount: 5, mainMax: 69, bonusCount: 1, bonusMax: 26, name: "Powerball" },
      mega: { mainCount: 5, mainMax: 70, bonusCount: 1, bonusMax: 25, name: "Mega Millions" },
      euro: { mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12, name: "EuroMillions" },
    };

    const format = formats[type] || formats["6/49"];

    try {
      const tickets: any[] = [];
      for (let t = 0; t < count; t++) {
        const mainNumbers = generateUniqueNumbers(format.mainCount, 1, format.mainMax);
        const bonusNumbers = format.bonusCount > 0 ? generateUniqueNumbers(format.bonusCount, 1, format.bonusMax) : [];

        tickets.push({
          ticket: t + 1,
          main_numbers: mainNumbers,
          bonus_numbers: bonusNumbers,
          formatted: format.bonusCount > 0
            ? `${mainNumbers.join("-")} + ${bonusNumbers.join("-")}`
            : mainNumbers.join("-"),
        });
      }

      return {
        success: true,
        data: {
          type: format.name,
          format: {
            main_count: format.mainCount,
            main_range: `1-${format.mainMax}`,
            bonus_count: format.bonusCount,
            bonus_range: format.bonusCount > 0 ? `1-${format.bonusMax}` : null,
          },
          tickets_count: tickets.length,
          tickets,
          note: "الأرقام عشوائية وآمنة (crypto). مفيش ضمان للفوز!",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function generateUniqueNumbers(count: number, min: number, max: number): number[] {
  const result: number[] = [];
  const seen = new Set<number>();

  while (result.length < count) {
    const range = max - min + 1;
    const byte = randomBytes(4).readUInt32BE(0);
    const num = min + (byte % range);
    if (!seen.has(num)) {
      seen.add(num);
      result.push(num);
    }
  }

  return result.sort((a, b) => a - b);
}
