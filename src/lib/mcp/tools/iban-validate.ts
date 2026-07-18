/**
 * MCP Tool: IBAN Validator
 * التحقق من IBAN + استخراج معلومات (محلي).
 */
import type { MCPTool } from "../types";

const COUNTRY_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, BE: 16, BA: 20, BG: 22, HR: 21, CY: 28,
  CZ: 24, DK: 18, EE: 20, FI: 18, FR: 27, DE: 22, GI: 23, GR: 27,
  HU: 28, IS: 26, IE: 22, IT: 27, LV: 21, LI: 21, LT: 20, LU: 20,
  MK: 19, MT: 31, MC: 27, ME: 22, NL: 18, NO: 15, PL: 28, PT: 25,
  RO: 24, SM: 27, RS: 22, SK: 24, SI: 19, ES: 24, SE: 24, CH: 21,
  TR: 26, GB: 22, AE: 23, EG: 29, SA: 24, QA: 29, KW: 30, BH: 22,
  JO: 30, LB: 28, MA: 28, DZ: 24, TN: 24, LY: 25,
};

const COUNTRY_NAMES: Record<string, string> = {
  AL: "ألبانيا", AD: "أندورا", AT: "النمسا", BE: "بلجيكا", BA: "البوسنة",
  BG: "بلغاريا", HR: "كرواتيا", CY: "قبرص", CZ: "التشيك", DK: "الدنمارك",
  EE: "إستونيا", FI: "فنلندا", FR: "فرنسا", DE: "ألمانيا", GI: "جبل طارق",
  GR: "اليونان", HU: "المجر", IS: "أيسلندا", IE: "أيرلندا", IT: "إيطاليا",
  LV: "لاتفيا", LI: "ليختنشتاين", LT: "ليتوانيا", LU: "لوكسمبورغ",
  MK: "مقدونيا", MT: "مالطا", MC: "موناكو", ME: "الجبل الأسود",
  NL: "هولندا", NO: "النرويج", PL: "بولندا", PT: "البرتغال",
  RO: "رومانيا", SM: "سان مارينو", RS: "صربيا", SK: "سلوفاكيا",
  SI: "سلوفينيا", ES: "إسبانيا", SE: "السويد", CH: "سويسرا",
  TR: "تركيا", GB: "بريطانيا", AE: "الإمارات", EG: "مصر",
  SA: "السعودية", QA: "قطر", KW: "الكويت", BH: "البحرين",
  JO: "الأردن", LB: "لبنان", MA: "المغرب", DZ: "الجزائر",
  TN: "تونس", LY: "ليبيا",
};

export const ibanValidateTool: MCPTool = {
  name: "iban_validate",
  description: "التحقق من IBAN + استخراج معلومات (محلي). استخدمها لما المست_USER يقول 'iban' أو 'حساب بنكي'.",
  parameters: {
    type: "object",
    properties: {
      iban: { type: "string", description: "رقم الـ IBAN" },
    },
    required: ["iban"],
  },
  async execute(params) {
    const iban = String(params.iban || "").replace(/\s/g, "").toUpperCase();
    if (!iban) return { success: false, error: "iban مطلوب" };

    try {
      // basic format check
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
        return {
          success: true,
          data: { valid: false, error: "صيغة IBAN غير صحيحة (يبدأ بكود دولة + رقمين)" },
        };
      }

      const countryCode = iban.slice(0, 2);
      const checkDigits = iban.slice(2, 4);
      const bban = iban.slice(4);

      // length check
      const expectedLength = COUNTRY_LENGTHS[countryCode];
      let lengthValid = true;
      if (expectedLength && iban.length !== expectedLength) {
        lengthValid = false;
      }

      // mod 97 check
      const isValid = validateIBANMod97(iban);

      return {
        success: true,
        data: {
          iban,
          valid: isValid && lengthValid,
          formatted: formatIBAN(iban),
          country_code: countryCode,
          country_name: COUNTRY_NAMES[countryCode] || "Unknown",
          check_digits: checkDigits,
          bban: bban,
          bank_code: bban.slice(0, 4),
          account_number: bban.slice(4),
          iban_length: iban.length,
          expected_length: expectedLength || null,
          length_valid: lengthValid,
          mod97_valid: isValid,
          checks: {
            format: /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban),
            length: lengthValid,
            mod97: isValid,
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function validateIBANMod97(iban: string): boolean {
  // rearrange: move first 4 chars to end
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // convert letters to numbers (A=10, B=11, ..., Z=35)
  let numericStr = "";
  for (const ch of rearranged) {
    if (/[A-Z]/.test(ch)) {
      numericStr += (ch.charCodeAt(0) - 55).toString();
    } else {
      numericStr += ch;
    }
  }

  // mod 97
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i])) % 97;
  }

  return remainder === 1;
}

function formatIBAN(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
