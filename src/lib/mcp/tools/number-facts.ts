/**
 * MCP Tool: Number Facts
 * بيولّد حقائق ممتعة عن أي رقم (محلي، بدون API خارجي).
 * بيدعم: trivia, math, date, year
 *
 * ملاحظة: numbersapi.com كان المجاني بس اتعطل، فبنيته محلياً.
 */
import type { MCPTool } from "../types";

// قاعدة بيانات صغيرة لحقائق ممتعة
const FUN_FACTS: Record<number, string> = {
  0: "0 هو الرقم الوحيد اللي مش سالب ولا موجب",
  1: "1 هو العنصر المحايد للضرب — أي رقم × 1 = نفسه",
  2: "2 هو أصغر رقم أولي ووحيد زوجي",
  3: "3 هو أصغر رقم أولي فردي",
  4: "4 هو أول رقم مربع كامل (2²)",
  5: "5 هو عدد أولي ومجموع أول رقمين أوليين (2+3)",
  6: "6 هو أول رقم كامل (1+2+3=6)",
  7: "7 هو رقم محظوظ في معظم الثقافات",
  8: "8 هو أول مكعب كامل (2³)",
  9: "9 هو أكبر رقم من رقم واحد",
  10: "10 هو أساس النظام العشري اللي نستخدمه",
  12: "12 هو رقم مميز — 12 شهر، 12 ساعة، 12 علامة برج",
  13: "13 رقم مشؤوم في بعض الثقافات (triskaidekaphobia)",
  42: "42 هو 'إجابة الحياة والكون وكل شيء' حسب Douglas Adams",
  100: "100 هو قرن كامل ودرجة غليان الماء",
  144: "144 هو دزينة دزينة (12×12)",
  365: "365 عدد أيام السنة (غير الكبيسة)",
  1000: "1000 هو أول رقم من 4 أرقام",
};

export const numberFactsTool: MCPTool = {
  name: "number_facts",
  description: "حقائق ممتعة عن أي رقم (محلي). استخدمها لما المستخدم يقول 'رقم' أو 'fact' أو 'حقيقة'.",
  parameters: {
    type: "object",
    properties: {
      number: { type: "string", description: "الرقم (أو 'random' لعشوائي)" },
      type: {
        type: "string",
        description: "النوع: trivia, math, date, year (افتراضي: trivia)",
        default: "trivia",
      },
    },
    required: ["number"],
  },
  async execute(params) {
    const numberRaw = String(params.number || "random").trim();
    const type = String(params.type || "trivia").toLowerCase();

    if (!numberRaw) return { success: false, error: "number مطلوب" };

    const validTypes = ["trivia", "math", "date", "year"];
    const selType = validTypes.includes(type) ? type : "trivia";

    // generate random number لو طلب
    let num: number;
    if (numberRaw.toLowerCase() === "random") {
      num = Math.floor(Math.random() * 1000) + 1;
    } else {
      num = parseInt(numberRaw);
      if (isNaN(num)) {
        return { success: false, error: "رقم غير صحيح" };
      }
    }

    try {
      let fact: string;

      switch (selType) {
        case "math":
          fact = generateMathFact(num);
          break;
        case "date":
          fact = generateDateFact(num);
          break;
        case "year":
          fact = generateYearFact(num);
          break;
        case "trivia":
        default:
          fact = generateTriviaFact(num);
          break;
      }

      return {
        success: true,
        data: {
          number: num,
          type: selType,
          fact,
          found: true,
          source: "local (DeltaAI)",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function generateTriviaFact(num: number): string {
  // لو في قاعدة البيانات
  if (FUN_FACTS[num]) return FUN_FACTS[num];

  const facts: string[] = [];
  facts.push(`${num} هو رقم ${num % 2 === 0 ? "زوجي" : "فردي"}`);

  if (isPrime(num)) facts.push(`${num} هو رقم أولي`);
  if (isPerfectSquare(num)) facts.push(`${num} هو مربع كامل (${Math.sqrt(num)}²)`);
  if (isPerfectCube(num)) facts.push(`${num} هو مكعب كامل (${Math.cbrt(num)}³)`);
  if (isFibonacci(num)) facts.push(`${num} من أرقام فيبوناتشي`);
  if (isPerfect(num)) facts.push(`${num} هو رقم كامل (مجموع قواسمه = نفسه)`);

  const digits = String(num).length;
  facts.push(`يتكون من ${digits} ${digits === 1 ? "رقم" : "أرقام"}`);

  // binary
  facts.push(`في النظام الثنائي: ${num.toString(2)}`);

  // hex
  facts.push(`في النظام الست عشري: 0x${num.toString(16).toUpperCase()}`);

  return facts.join(". ");
}

function generateMathFact(num: number): string {
  const facts: string[] = [];

  facts.push(`${num} = ${num}`);
  facts.push(`مربع ${num} = ${num * num}`);
  facts.push(`مكعب ${num} = ${num * num * num}`);
  facts.push(`جذر ${num} = ${Math.sqrt(num).toFixed(4)}`);

  if (isPrime(num)) {
    facts.push(`${num} هو رقم أولي (لا يقبل القسمة إلا على 1 ونفسه)`);
  } else {
    const factors = getFactors(num);
    facts.push(`عوامل ${num}: ${factors.join(" × ")}`);
  }

  facts.push(`عدد القواسم: ${getDivisors(num).length}`);

  return facts.join(". ");
}

function generateDateFact(dayOfYear: number): string {
  // dayOfYear 1-366
  if (dayOfYear < 1 || dayOfYear > 366) {
    return `${dayOfYear} مش يوم صحيح في السنة (1-366)`;
  }

  const date = new Date(2024, 0, dayOfYear); // 2024 سنة كبيسة
  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();

  return `اليوم رقم ${dayOfYear} في السنة = ${day} ${month}`;
}

function generateYearFact(year: number): string {
  if (year < 0) return `السنة ${year} قبل الميلاد`;
  if (year > 2100) return `السنة ${year} في المستقبل`;

  const century = Math.ceil(year / 100);
  const decade = Math.floor(year / 10) * 10;

  const facts: string[] = [];
  facts.push(`السنة ${year} في القرن الـ ${century}`);
  facts.push(`في العقد الـ ${decade}s`);
  facts.push(year % 4 === 0 ? "سنة كبيسة" : "سنة غير كبيسة");

  return facts.join(". ");
}

// math helpers
function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

function isPerfectSquare(n: number): boolean {
  const s = Math.sqrt(n);
  return s === Math.floor(s);
}

function isPerfectCube(n: number): boolean {
  const c = Math.cbrt(n);
  return c === Math.floor(c);
}

function isFibonacci(n: number): boolean {
  // n is Fibonacci iff 5n²+4 or 5n²-4 is a perfect square
  const a = 5 * n * n + 4;
  const b = 5 * n * n - 4;
  return isPerfectSquare(a) || isPerfectSquare(b);
}

function isPerfect(n: number): boolean {
  if (n < 2) return false;
  const divisors = getDivisors(n).filter((d) => d !== n);
  const sum = divisors.reduce((a, b) => a + b, 0);
  return sum === n;
}

function getFactors(n: number): number[] {
  if (n < 2) return [n];
  const factors: number[] = [];
  let num = n;
  for (let i = 2; i <= num; i++) {
    while (num % i === 0) {
      factors.push(i);
      num /= i;
    }
  }
  return factors;
}

function getDivisors(n: number): number[] {
  const divisors: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (n % i === 0) divisors.push(i);
  }
  return divisors;
}
