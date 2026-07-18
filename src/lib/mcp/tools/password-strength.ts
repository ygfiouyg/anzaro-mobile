/**
 * MCP Tool: Password Strength Analyzer
 * بيسجل قوة كلمة المرور ويعطي تحسينات (محلي).
 */
import type { MCPTool } from "../types";

export const passwordStrengthTool: MCPTool = {
  name: "password_strength",
  description: "حلّل قوة كلمة مرور (محلي). استخدمها لما المستخدم يقول 'password strength' أو 'قوة الباسورد'.",
  parameters: {
    type: "object",
    properties: {
      password: { type: "string", description: "كلمة المرور للتحليل" },
    },
    required: ["password"],
  },
  async execute(params) {
    const password = String(params.password || "");
    if (!password) return { success: false, error: "password مطلوب" };
    if (password.length > 1000) return { success: false, error: "كلمة المرور طويلة جداً" };

    try {
      const analysis = analyzePassword(password);
      return { success: true, data: analysis };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function analyzePassword(password: string) {
  const length = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const hasSpace = /\s/.test(password);

  // charset size
  let charsetSize = 0;
  if (hasLower) charsetSize += 26;
  if (hasUpper) charsetSize += 26;
  if (hasNumber) charsetSize += 10;
  if (hasSymbol) charsetSize += 33;

  // entropy
  const entropy = length * Math.log2(charsetSize || 1);

  // strength level
  let level: string, score: number;
  if (entropy < 28) { level = "ضعيفة جداً"; score = 1; }
  else if (entropy < 36) { level = "ضعيفة"; score = 2; }
  else if (entropy < 60) { level = "متوسطة"; score = 3; }
  else if (entropy < 80) { level = "قوية"; score = 4; }
  else if (entropy < 128) { level = "قوية جداً"; score = 5; }
  else { level = "أسطورية"; score = 6; }

  // crack time estimation (at 10 billion guesses/sec)
  const guesses = Math.pow(2, entropy);
  const secondsToCrack = guesses / 10e9;
  const crackTime = formatTime(secondsToCrack);

  // common password check
  const commonPasswords = ["password", "123456", "123456789", "qwerty", "abc123", "password123", "admin", "letmein", "welcome", "monkey", "dragon"];
  const isCommon = commonPasswords.some((p) => password.toLowerCase().includes(p));

  // patterns
  const hasSequential = /(abc|bcd|cde|def|123|234|345|456|567|678|789|890|qwe|wer|ert|rty|asd|sdf|dfg)/i.test(password);
  const hasRepeating = /(.)\1{2,}/.test(password); // 3+ same char
  const isOnlyNumbers = /^\d+$/.test(password);
  const isOnlyLetters = /^[a-zA-Z]+$/.test(password);

  // suggestions
  const suggestions: string[] = [];
  if (length < 8) suggestions.push("زوّد الطول لـ 8 حروف على الأقل");
  if (length < 12) suggestions.push("الأفضل 12+ حرف");
  if (!hasUpper) suggestions.push("أضف حروف كبيرة (A-Z)");
  if (!hasLower) suggestions.push("أضف حروف صغيرة (a-z)");
  if (!hasNumber) suggestions.push("أضف أرقام (0-9)");
  if (!hasSymbol) suggestions.push("أضف رموز (!@#$%^&*)");
  if (isCommon) suggestions.push("⚠️avoid كلمات شائعة");
  if (hasSequential) suggestions.push("تجنّب تسلسل (abc, 123)");
  if (hasRepeating) suggestions.push("تجنّب تكرار حروف (aaa, 111)");
  if (isOnlyNumbers) suggestions.push("مش بس أرقام");
  if (isOnlyLetters) suggestions.push("مش بس حروف");

  return {
    password_length: length,
    entropy_bits: Math.round(entropy),
    charset_size: charsetSize,
    score: score,
    strength: level,
    crack_time: crackTime,
    crack_time_seconds: secondsToCrack,
    checks: {
      has_lowercase: hasLower,
      has_uppercase: hasUpper,
      has_numbers: hasNumber,
      has_symbols: hasSymbol,
      has_spaces: hasSpace,
      is_common: isCommon,
      has_sequential: hasSequential,
      has_repeating: hasRepeating,
      is_only_numbers: isOnlyNumbers,
      is_only_letters: isOnlyLetters,
    },
    suggestions: suggestions.length > 0 ? suggestions : ["✓ كلمة المرور قوية"],
    is_strong: score >= 4,
  };
}

function formatTime(seconds: number): string {
  if (seconds < 1) return "أقل من ثانية";
  if (seconds < 60) return `${Math.round(seconds)} ثانية`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ساعة`;
  if (seconds < 31536000) return `${Math.round(seconds / 86400)} يوم`;
  if (seconds < 31536000 * 100) return `${Math.round(seconds / 31536000)} سنة`;
  if (seconds < 31536000 * 1e6) return `${Math.round(seconds / 31536000 / 1000)} ألف سنة`;
  if (seconds < 31536000 * 1e9) return `${Math.round(seconds / 31536000 / 1e6)} مليون سنة`;
  return `مليارات السنين`;
}
