/**
 * MCP Tool: UUID Generator
 * توليد UUIDs محلياً (بدون API — بـ crypto.randomUUID).
 * بيدعم UUID v4 + Nano ID + tokens.
 */
import type { MCPTool } from "../types";
import { randomBytes } from "crypto";

export const uuidGeneratorTool: MCPTool = {
  name: "uuid_generator",
  description: "ولّد UUIDs و tokens فريدة (محلي، بدون API). استخدمها لما المستخدم يقول 'uuid' أو 'token' أو 'مفتاح فريد'.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "النوع: uuid (v4), nanoid, token, all",
        default: "uuid",
      },
      count: { type: "number", description: "عدد الـ UUIDs (افتراضي: 1، أقصى: 100)", default: 1 },
      length: { type: "number", description: "الطول للـ nanoid/token (افتراضي: 21)", default: 21 },
    },
    required: [],
  },
  async execute(params) {
    const type = String(params.type || "uuid").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 1));
    const length = Math.min(64, Math.max(8, Number(params.length) || 21));

    try {
      const results: string[] = [];

      for (let i = 0; i < count; i++) {
        let id: string;
        switch (type) {
          case "uuid":
            // UUID v4 باستخدام crypto
            id = (globalThis.crypto as any)?.randomUUID?.()
              ? (globalThis.crypto as any).randomUUID()
              : formatUUID(randomBytes(16));
            break;

          case "nanoid":
            id = generateNanoId(length);
            break;

          case "token":
            // token hex آمن
            id = randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
            break;

          case "all":
            // رجّع كل الأنواع
            const uuid = (globalThis.crypto as any)?.randomUUID?.()
              ? (globalThis.crypto as any).randomUUID()
              : formatUUID(randomBytes(16));
            results.push(uuid, generateNanoId(length), randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length));
            continue;

          default:
            return { success: false, error: `نوع غير معروف: ${type}. جرّب: uuid, nanoid, token, all` };
        }
        results.push(id);
      }

      return {
        success: true,
        data: {
          type,
          count: results.length,
          ...(type === "all" ? { uuids: [results[0]], nanoids: [results[1]], tokens: [results[2]] } : { ids: results }),
          generated_at: new Date().toISOString(),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

/** توليد UUID v4 من 16 byte */
function formatUUID(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  // اضبط bits للـ v4
  const v = hex.slice(0, 12) + "4" + hex.slice(13, 16);
  const variant = (parseInt(hex.slice(16, 18), 16) & 0x3) | 0x8;
  const rest = variant.toString(16).padStart(2, "0") + hex.slice(18);
  const full = v + rest;
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}-${full.slice(16, 20)}-${full.slice(20, 32)}`;
}

/** توليد Nano ID (URL-safe) */
function generateNanoId(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}
