/**
 * MCP Tool: Password Generator
 * بيولّد كلمات مرور قوية (محلي، بدون API).
 * بيدعم: length, includeNumbers, includeSymbols, excludeAmbiguous, passphrase.
 */
import type { MCPTool } from "../types";
import { randomBytes } from "crypto";

export const passwordGeneratorTool: MCPTool = {
  name: "password_generator",
  description: "ولّد كلمات مرور قوية (محلي). استخدمها لما المستخدم يقول 'كلمة مرور' أو 'password' أو 'باسورد'.",
  parameters: {
    type: "object",
    properties: {
      length: { type: "number", description: "الطول (افتراضي: 16، أقصى: 128)", default: 16 },
      count: { type: "number", description: "عدد الكلمات (افتراضي: 1، أقصى: 10)", default: 1 },
      uppercase: { type: "boolean", description: "حروف كبيرة (افتراضي: true)", default: true },
      lowercase: { type: "boolean", description: "حروف صغيرة (افتراضي: true)", default: true },
      numbers: { type: "boolean", description: "أرقام (افتراضي: true)", default: true },
      symbols: { type: "boolean", description: "رموز (افتراضي: true)", default: true },
      excludeAmbiguous: { type: "boolean", description: "استبعد الحروف الملتبسة (0/O, 1/l/I)", default: false },
      type: { type: "string", description: "random أو passphrase (افتراضي: random)", default: "random" },
    },
    required: [],
  },
  async execute(params) {
    const length = Math.min(128, Math.max(4, Number(params.length) || 16));
    const count = Math.min(10, Math.max(1, Number(params.count) || 1));
    const useUpper = params.uppercase !== false;
    const useLower = params.lowercase !== false;
    const useNumbers = params.numbers !== false;
    const useSymbols = params.symbols !== false;
    const excludeAmbiguous = Boolean(params.excludeAmbiguous);
    const type = String(params.type || "random").toLowerCase();

    try {
      if (type === "passphrase") {
        const passphrases: any[] = [];
        for (let i = 0; i < count; i++) {
          passphrases.push(generatePassphrase(length));
        }
        return {
          success: true,
          data: {
            type: "passphrase",
            count: passphrases.length,
            passwords: passphrases.map((p) => p.password),
            word_count: length,
            details: passphrases,
          },
        };
      }

      // random password
      let charset = "";
      if (useLower) charset += "abcdefghijklmnopqrstuvwxyz";
      if (useUpper) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      if (useNumbers) charset += "0123456789";
      if (useSymbols) charset += "!@#$%^&*()_+-=[]{}|;:,.<>?";

      if (excludeAmbiguous) {
        charset = charset.replace(/[0O1lI|]/g, "");
      }

      if (!charset) {
        return { success: false, error: "لازم تفعّل على الأقل نوع واحد من الحروف" };
      }

      const passwords: any[] = [];
      for (let i = 0; i < count; i++) {
        const password = generateSecurePassword(length, charset);
        const strength = analyzeStrength(password);
        passwords.push({
          password,
          length,
          strength: strength.level,
          entropy_bits: Math.round(strength.entropy),
          has_upper: /[A-Z]/.test(password),
          has_lower: /[a-z]/.test(password),
          has_number: /[0-9]/.test(password),
          has_symbol: /[^A-Za-z0-9]/.test(password),
        });
      }

      return {
        success: true,
        data: {
          type: "random",
          count: passwords.length,
          passwords: passwords.map((p) => p.password),
          details: passwords,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function generateSecurePassword(length: number, charset: string): string {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

function analyzeStrength(password: string): { level: string; entropy: number } {
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^A-Za-z0-9]/.test(password)) charsetSize += 32;

  const entropy = password.length * Math.log2(charsetSize || 1);

  let level: string;
  if (entropy < 28) level = "ضعيفة جداً";
  else if (entropy < 36) level = "ضعيفة";
  else if (entropy < 60) level = "متوسطة";
  else if (entropy < 128) level = "قوية";
  else level = "قوية جداً";

  return { level, entropy };
}

const WORDS = [
  "apple", "brave", "cloud", "dance", "eagle", "flame", "grace", "honor",
  "ivory", "jungle", "kneel", "lemon", "mango", "noble", "ocean", "pearl",
  "quiet", "river", "storm", "tiger", "umbra", "vivid", "whale", "xenon",
  "youth", "zebra", "alpha", "blaze", "crisp", "delta", "ember", "frost",
  "gleam", "haven", "index", "jewel", "karma", "lunar", "mystic", "nova",
  "opal", "prism", "quest", "royal", "solar", "thunder", "ultra", "vortex",
  "wisdom", "xray", "yonder", "zenith",
];

function generatePassphrase(wordCount: number): any {
  const bytes = randomBytes(wordCount * 2);
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = (bytes[i * 2] << 8 | bytes[i * 2 + 1]) % WORDS.length;
    words.push(WORDS[idx]);
  }
  // ضيف رقم ورمز
  const num = bytes[0] % 100;
  const symbol = "!@#$%^&*"[bytes[1] % 8];
  const password = `${words.join("-")}-${num}${symbol}`;
  return {
    password,
    words,
    word_count: words.length,
    length: password.length,
    strength: analyzeStrength(password).level,
  };
}
