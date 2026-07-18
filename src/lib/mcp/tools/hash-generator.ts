/**
 * MCP Tool: Hash Generator
 * بيولّد hashes لأي نص (محلي، بدون API).
 * بيدعم: MD5, SHA1, SHA256, SHA512, SHA3, Base64 encode/decode.
 */
import type { MCPTool } from "../types";
import { createHash } from "crypto";

export const hashGeneratorTool: MCPTool = {
  name: "hash_generator",
  description: "ولّد hashes لأي نص (محلي). استخدمها لما المستخدم يقول 'hash' أو 'md5' أو 'sha256' أو 'base64'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للـ hashing" },
      algorithm: {
        type: "string",
        description: "الخوارزمية: md5, sha1, sha256, sha512, sha3-256, base64-encode, base64-decode, all",
        default: "sha256",
      },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const algorithm = String(params.algorithm || "sha256").toLowerCase();

    if (!text) return { success: false, error: "text مطلوب" };

    try {
      // base64 encode/decode (مش hashes)
      if (algorithm === "base64-encode") {
        const encoded = Buffer.from(text, "utf-8").toString("base64");
        return {
          success: true,
          data: {
            algorithm,
            input: text.slice(0, 100),
            input_length: text.length,
            output: encoded,
            output_length: encoded.length,
          },
        };
      }

      if (algorithm === "base64-decode") {
        try {
          const decoded = Buffer.from(text, "base64").toString("utf-8");
          return {
            success: true,
            data: {
              algorithm,
              input: text.slice(0, 100),
              input_length: text.length,
              output: decoded,
              output_length: decoded.length,
            },
          };
        } catch {
          return { success: false, error: "Base64 decode failed — نص غير صالح" };
        }
      }

      const validAlgos = ["md5", "sha1", "sha256", "sha512", "sha3-256", "sha3-512"];
      const selAlgo = validAlgos.includes(algorithm) ? algorithm : "sha256";

      if (algorithm === "all") {
        const hashes: Record<string, string> = {};
        for (const algo of validAlgos) {
          hashes[algo] = hashWith(text, algo);
        }
        return {
          success: true,
          data: {
            algorithm: "all",
            input: text.slice(0, 100),
            input_length: text.length,
            hashes,
          },
        };
      }

      const hash = hashWith(text, selAlgo);
      return {
        success: true,
        data: {
          algorithm: selAlgo,
          input: text.slice(0, 100),
          input_length: text.length,
          hash,
          hash_length: hash.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function hashWith(text: string, algorithm: string): string {
  // Node.js crypto بيدعم: md5, sha1, sha256, sha512, sha3-256, sha3-512
  const algoMap: Record<string, string> = {
    "sha3-256": "sha3-256",
    "sha3-512": "sha3-512",
  };
  const nodeAlgo = algoMap[algorithm] || algorithm;
  return createHash(nodeAlgo as any).update(text, "utf-8").digest("hex");
}
