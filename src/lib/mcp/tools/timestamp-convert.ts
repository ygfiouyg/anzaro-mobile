/**
 * MCP Tool: Timestamp Converter
 * تحويل بين Unix timestamp وتواريخ (محلي).
 */
import type { MCPTool } from "../types";

export const timestampConvertTool: MCPTool = {
  name: "timestamp_convert",
  description: "تحويل بين Unix timestamp وتواريخ (محلي). استخدمها لما المستخدم يقول 'timestamp' أو 'unix time' أو 'epoch'.",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "القيمة (timestamp رقم أو تاريخ)" },
      unit: { type: "string", description: "seconds أو milliseconds (افتراضي: seconds)", default: "seconds" },
    },
    required: ["value"],
  },
  async execute(params) {
    const value = String(params.value || "").trim();
    const unit = String(params.unit || "seconds").toLowerCase();

    if (!value) return { success: false, error: "value مطلوب" };

    try {
      let date: Date;
      let inputType: string;

      // لو رقم → timestamp
      if (/^-?\d+$/.test(value)) {
        const num = parseInt(value);
        const ms = unit === "milliseconds" ? num : num * 1000;
        date = new Date(ms);
        inputType = `unix_${unit}`;
      } else {
        // جرّب parse كتاريخ
        date = new Date(value);
        if (isNaN(date.getTime())) {
          return { success: false, error: "صيغة غير صحيحة (رقم أو تاريخ)" };
        }
        inputType = "date_string";
      }

      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffSeconds = Math.round(diffMs / 1000);
      const diffMinutes = Math.round(diffSeconds / 60);
      const diffHours = Math.round(diffMinutes / 60);
      const diffDays = Math.round(diffHours / 24);

      // relative time
      let relative: string;
      const absDiff = Math.abs(diffMs);
      if (absDiff < 60000) relative = `${Math.round(absDiff / 1000)} ثانية`;
      else if (absDiff < 3600000) relative = `${Math.round(absDiff / 60000)} دقيقة`;
      else if (absDiff < 86400000) relative = `${Math.round(absDiff / 3600000)} ساعة`;
      else relative = `${Math.round(absDiff / 86400000)} يوم`;
      relative = diffMs >= 0 ? `بعد ${relative}` : `من ${relative} مضت`;

      return {
        success: true,
        data: {
          input: value,
          input_type: inputType,
          unix_seconds: Math.floor(date.getTime() / 1000),
          unix_milliseconds: date.getTime(),
          iso8601: date.toISOString(),
          iso_local: date.toLocaleString("en-GB"),
          date: date.toISOString().split("T")[0],
          time: date.toISOString().split("T")[1].split(".")[0],
          day_of_week: date.toLocaleDateString("en-US", { weekday: "long" }),
          month_name: date.toLocaleDateString("en-US", { month: "long" }),
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hours: date.getHours(),
          minutes: date.getMinutes(),
          seconds: date.getSeconds(),
          timezone_offset: date.getTimezoneOffset(),
          relative_time: relative,
          diff_from_now: {
            seconds: diffSeconds,
            minutes: diffMinutes,
            hours: diffHours,
            days: diffDays,
          },
          is_past: diffMs < 0,
          is_future: diffMs > 0,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
