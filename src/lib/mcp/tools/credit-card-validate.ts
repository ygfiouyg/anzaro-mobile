/**
 * MCP Tool: Credit Card Validator
 * التحقق من بطاقات الائتمان (Luhn algorithm) (محلي).
 */
import type { MCPTool } from "../types";

export const creditCardValidateTool: MCPTool = {
  name: "credit_card_validate",
  description: "التحقق من بطاقة ائتمان (Luhn) (محلي). استخدمها لما المستخدم يقول 'credit card' أو 'بطاقة ائتمان'.",
  parameters: {
    type: "object",
    properties: {
      number: { type: "string", description: "رقم البطاقة" },
    },
    required: ["number"],
  },
  async execute(params) {
    const number = String(params.number || "").replace(/[\s-]/g, "");
    if (!number) return { success: false, error: "number مطلوب" };

    try {
      // check if only digits
      if (!/^\d+$/.test(number)) {
        return {
          success: true,
          data: { valid: false, error: "رقم البطاقة لازم أرقام فقط" },
        };
      }

      const isValid = luhnCheck(number);
      const cardType = detectCardType(number);
      const formatted = formatCardNumber(number);

      return {
        success: true,
        data: {
          number: number.slice(0, 6) + "****" + number.slice(-4),
          full_number: number,
          valid: isValid,
          formatted,
          card_type: cardType.name,
          card_network: cardType.network,
          length: number.length,
          valid_length: cardType.validLengths,
          length_valid: cardType.validLengths.includes(number.length),
          luhn_valid: isValid,
          issuer: cardType.issuer,
          checks: {
            luhn: isValid,
            length: cardType.validLengths.includes(number.length),
            format: /^\d+$/.test(number),
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function luhnCheck(num: string): boolean {
  let sum = 0;
  let isEven = false;

  for (let i = num.length - 1; i >= 0; i--) {
    let digit = parseInt(num[i]);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

function detectCardType(num: string): any {
  // Visa
  if (/^4/.test(num)) {
    return { name: "Visa", network: "Visa", issuer: "Various banks", validLengths: [13, 16, 19] };
  }
  // Mastercard
  if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) {
    return { name: "Mastercard", network: "Mastercard", issuer: "Various banks", validLengths: [16] };
  }
  // Amex
  if (/^3[47]/.test(num)) {
    return { name: "American Express", network: "Amex", issuer: "American Express", validLengths: [15] };
  }
  // Discover
  if (/^6(?:011|5|4|22)/.test(num)) {
    return { name: "Discover", network: "Discover", issuer: "Discover Bank", validLengths: [16, 19] };
  }
  // Diners Club
  if (/^3[0689]/.test(num)) {
    return { name: "Diners Club", network: "Diners Club International", issuer: "Diners Club", validLengths: [14, 16, 19] };
  }
  // JCB
  if (/^35/.test(num)) {
    return { name: "JCB", network: "JCB", issuer: "JCB Co., Ltd.", validLengths: [16, 17, 18, 19] };
  }
  // UnionPay
  if (/^62/.test(num)) {
    return { name: "UnionPay", network: "China UnionPay", issuer: "UnionPay", validLengths: [16, 17, 18, 19] };
  }
  // Maestro
  if (/^(50|56|57|58|6)/.test(num)) {
    return { name: "Maestro", network: "Maestro", issuer: "Mastercard", validLengths: [12, 13, 14, 15, 16, 17, 18, 19] };
  }

  return { name: "Unknown", network: "Unknown", issuer: "Unknown", validLengths: [13, 15, 16, 19] };
}

function formatCardNumber(num: string): string {
  // Amex format: 4-6-5
  if (/^3[47]/.test(num) && num.length === 15) {
    return `${num.slice(0, 4)} ${num.slice(4, 10)} ${num.slice(10)}`;
  }
  // Default: groups of 4
  return num.replace(/(.{4})/g, "$1 ").trim();
}
