/**
 * MCP Tool: Dice Roller
 * بيقلب نرد بأي عدد أوجه (D&D style) (محلي).
 */
import type { MCPTool } from "../types";
import { randomBytes } from "crypto";

export const diceRollerTool: MCPTool = {
  name: "dice_roller",
  description: "اقلب نرد بأي عدد أوجه (محلي). استخدمها لما المستخدم يقول 'نرد' أو 'dice' أو 'D20' أو 'ارمي نرد'.",
  parameters: {
    type: "object",
    properties: {
      dice: { type: "string", description: "صيغة النرد: NdM (مثلاً: 3d6, 1d20, 2d10+5)", default: "1d6" },
      count: { type: "number", description: "عدد مرات القلب (افتراضي: 1)", default: 1 },
    },
    required: ["dice"],
  },
  async execute(params) {
    const diceStr = String(params.dice || "1d6").toLowerCase().trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 1));

    // parse: NdM[+K] or NdM-K]
    const match = diceStr.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/);
    if (!match) {
      return { success: false, error: "صيغة نرد غير صحيحة. مثال: 3d6, 1d20, 2d10+5" };
    }

    const numDice = parseInt(match[1]);
    const numFaces = parseInt(match[2]);
    const modifierOp = match[3] || null;
    const modifierVal = match[4] ? parseInt(match[4]) : 0;

    if (numDice < 1 || numDice > 1000) return { success: false, error: "عدد النرد لازم 1-1000" };
    if (numFaces < 2 || numFaces > 10000) return { success: false, error: "عدد الأوجه لازم 2-10000" };

    try {
      const rolls: any[] = [];

      for (let r = 0; r < count; r++) {
        const diceResults: number[] = [];
        for (let d = 0; d < numDice; d++) {
          diceResults.push(secureRandomInt(1, numFaces));
        }

        const sum = diceResults.reduce((a, b) => a + b, 0);
        let total = sum;
        if (modifierOp === "+") total += modifierVal;
        else if (modifierOp === "-") total -= modifierVal;

        rolls.push({
          dice: diceResults,
          sum,
          modifier: modifierOp ? `${modifierOp}${modifierVal}` : null,
          total,
          min: Math.min(...diceResults),
          max: Math.max(...diceResults),
        });
      }

      const totals = rolls.map((r) => r.total);
      return {
        success: true,
        data: {
          dice_notation: diceStr,
          parsed: { count: numDice, faces: numFaces, modifier: modifierOp ? `${modifierOp}${modifierVal}` : null },
          rolls,
          rolls_count: rolls.length,
          stats: {
            min_total: Math.min(...totals),
            max_total: Math.max(...totals),
            avg_total: Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100,
            sum_total: totals.reduce((a, b) => a + b, 0),
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function secureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytes = randomBytes(4);
  const random = bytes.readUInt32BE(0) % range;
  return min + random;
}
