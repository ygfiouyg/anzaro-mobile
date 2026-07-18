/**
 * MCP Tool: Cron Expression Parser
 * بيحلّل cron expressions ويرجّع وصف + next runs.
 * محلي — بدون API خارجي.
 *
 * Cron format: minute hour day-of-month month day-of-week
 * مثال: "0 9 * * 1-5" = كل يوم اسبوع الساعة 9 صباحاً
 */
import type { MCPTool } from "../types";

export const cronParserTool: MCPTool = {
  name: "cron_parser",
  description: "حلّل cron expression + next runs (محلي). استخدمها لما المستخدم يقول 'cron' أو 'مهمة مجدولة' أو 'schedule'.",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "الـ cron expression (5 حقول)" },
      count: { type: "number", description: "عدد الـ next runs للحساب (افتراضي: 5)", default: 5 },
    },
    required: ["expression"],
  },
  async execute(params) {
    const expr = String(params.expression || "").trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 5));

    if (!expr) return { success: false, error: "expression مطلوب" };

    try {
      const parts = expr.split(/\s+/);
      if (parts.length !== 5) {
        return { success: false, error: "Cron expression لازم يكون 5 حقول (minute hour day month weekday)" };
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // تحقق من صحة كل حقل
      const validation = validateCronField(minute, 0, 59, "minute");
      if (!validation.valid) return { success: false, error: validation.error };
      const validation2 = validateCronField(hour, 0, 23, "hour");
      if (!validation2.valid) return { success: false, error: validation2.error };
      const validation3 = validateCronField(dayOfMonth, 1, 31, "day of month");
      if (!validation3.valid) return { success: false, error: validation3.error };
      const validation4 = validateCronField(month, 1, 12, "month");
      if (!validation4.valid) return { success: false, error: validation4.error };
      const validation5 = validateCronField(dayOfWeek, 0, 7, "day of week");
      if (!validation5.valid) return { success: false, error: validation5.error };

      // وصف بالعربي
      const description = describeCron(minute, hour, dayOfMonth, month, dayOfWeek);

      // حساب next runs
      const nextRuns = calculateNextRuns(
        { minute, hour, dayOfMonth, month, dayOfWeek },
        count
      );

      return {
        success: true,
        data: {
          expression: expr,
          fields: {
            minute,
            hour,
            day_of_month: dayOfMonth,
            month,
            day_of_week: dayOfWeek,
          },
          description,
          next_runs: nextRuns,
          next_run: nextRuns[0] || null,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function validateCronField(
  field: string,
  min: number,
  max: number,
  name: string
): { valid: boolean; error?: string } {
  if (field === "*") return { valid: true };

  // استبدل الأسماء بالأرقام (months, days)
  const normalized = field
    .toLowerCase()
    .replace(/jan/g, "1").replace(/feb/g, "2").replace(/mar/g, "3")
    .replace(/apr/g, "4").replace(/may/g, "5").replace(/jun/g, "6")
    .replace(/jul/g, "7").replace(/aug/g, "8").replace(/sep/g, "9")
    .replace(/oct/g, "10").replace(/nov/g, "11").replace(/dec/g, "12")
    .replace(/sun/g, "0").replace(/mon/g, "1").replace(/tue/g, "2")
    .replace(/wed/g, "3").replace(/thu/g, "4").replace(/fri/g, "5")
    .replace(/sat/g, "6");

  const parts = normalized.split(",");
  for (const part of parts) {
    // step: */n or a-b/n or a/n
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const range = stepMatch[1];
      const step = parseInt(stepMatch[2]);
      if (range === "*") {
        if (step < 1 || step > max) {
          return { valid: false, error: `${name}: step ${step} خارج النطاق` };
        }
      } else {
        const [s, e] = range.includes("-") ? range.split("-").map(Number) : [Number(range), max];
        if (isNaN(s) || isNaN(e) || s < min || e > max || s > e) {
          return { valid: false, error: `${name}: "${part}" غير صالح` };
        }
      }
      continue;
    }

    // range: a-b
    if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      if (isNaN(s) || isNaN(e) || s < min || e > max || s > e) {
        return { valid: false, error: `${name}: "${part}" خارج النطاق (${min}-${max})` };
      }
      continue;
    }

    // single value
    const val = parseInt(part);
    if (isNaN(val) || val < min || val > max) {
      return { valid: false, error: `${name}: "${part}" خارج النطاق (${min}-${max})` };
    }
  }

  return { valid: true };
}

function describeCron(minute: string, hour: string, dom: string, month: string, dow: string): string {
  const parts: string[] = [];

  // الوقت
  if (minute === "*" && hour === "*") {
    parts.push("كل دقيقة");
  } else if (minute !== "*" && hour !== "*") {
    const h = parseInt(hour);
    const m = parseInt(minute);
    if (!isNaN(h) && !isNaN(m)) {
      parts.push(`الساعة ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  } else if (hour !== "*") {
    parts.push(`كل دقيقة من الساعة ${hour}`);
  } else {
    parts.push(`في الدقيقة ${minute} من كل ساعة`);
  }

  // اليوم
  if (dow !== "*" && dom === "*") {
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"];
    const dayNums = dow.split(",");
    const dayNames = dayNums.map((d) => days[parseInt(d) % 7] || d);
    parts.push(`كل ${dayNames.join("، ")}`);
  } else if (dom !== "*" && dow === "*") {
    parts.push(`يوم ${dom} من كل شهر`);
  } else if (dom === "*" && dow === "*") {
    parts.push("كل يوم");
  }

  // الشهر
  if (month !== "*") {
    const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const monthNums = month.split(",");
    const monthNames = monthNums.map((m) => months[parseInt(m) - 1] || m);
    parts.push(`في ${monthNames.join("، ")}`);
  }

  return parts.join("، ");
}

function calculateNextRuns(cron: any, count: number): string[] {
  const runs: string[] = [];
  let current = new Date();
  current.setSeconds(0, 0);

  // نضيف دقيقة ونبدأ البحث
  current.setMinutes(current.getMinutes() + 1);

  const maxIterations = 525600; // سنة كاملة بالدقائق

  for (let i = 0; i < maxIterations && runs.length < count; i++) {
    if (matchesCron(current, cron)) {
      runs.push(current.toISOString());
    }
    current.setMinutes(current.getMinutes() + 1);
  }

  return runs;
}

function matchesCron(date: Date, cron: any): boolean {
  const m = date.getMinutes();
  const h = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay();

  return (
    matchField(cron.minute, m, 0, 59) &&
    matchField(cron.hour, h, 0, 23) &&
    matchField(cron.dayOfMonth, dom, 1, 31) &&
    matchField(cron.month, month, 1, 12) &&
    matchField(cron.dayOfWeek, dow % 7, 0, 7)
  );
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;

  const parts = field.split(",");
  for (const part of parts) {
    // step
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const range = stepMatch[1];
      const step = parseInt(stepMatch[2]);
      const start = range === "*" ? min : range.includes("-") ? parseInt(range.split("-")[0]) : parseInt(range);
      const end = range === "*" ? max : range.includes("-") ? parseInt(range.split("-")[1]) : parseInt(range);
      if (value >= start && value <= end && (value - start) % step === 0) {
        return true;
      }
      continue;
    }

    // range
    if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      if (value >= s && value <= e) return true;
      continue;
    }

    // single
    if (parseInt(part) === value) return true;
  }

  return false;
}
