/**
 * MCP Tool: Coin Flip
 * بيرمي عملة (head/tails) (محلي).
 */
import type { MCPTool } from "../types";
import { randomBytes } from "crypto";

export const coinFlipTool: MCPTool = {
  name: "coin_flip",
  description: "ارمي عملة (heads/tails) (محلي). استخدمها لما المستخدم يقول 'عملة' أو 'coin flip' أو 'قرعة'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد المرات (افتراضي: 1، أقصى: 10000)", default: 1 },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(10000, Math.max(1, Number(params.count) || 1));

    try {
      const flips: string[] = [];
      for (let i = 0; i < count; i++) {
        const byte = randomBytes(1)[0];
        flips.push(byte % 2 === 0 ? "heads" : "tails");
      }

      const heads = flips.filter((f) => f === "heads").length;
      const tails = flips.filter((f) => f === "tails").length;

      return {
        success: true,
        data: {
          count,
          flips: count <= 100 ? flips : flips.slice(0, 100),
          heads_count: heads,
          tails_count: tails,
          heads_percent: Math.round((heads / count) * 1000) / 10,
          tails_percent: Math.round((tails / count) * 1000) / 10,
          result: count === 1 ? flips[0] : `${heads} heads / ${tails} tails`,
          truncated: count > 100,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
