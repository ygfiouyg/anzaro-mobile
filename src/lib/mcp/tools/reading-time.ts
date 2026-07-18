/**
 * MCP Tool: Reading Time Calculator
 * حساب وقت القراءة + speaking + scanning (محلي).
 */
import type { MCPTool } from "../types";

export const readingTimeTool: MCPTool = {
  name: "reading_time",
  description: "حساب وقت قراءة/إلقاء نص (محلي). استخدمها لما المستخدم يقول 'reading time' أو 'وقت القراءة'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص" },
      wpm: { type: "number", description: "كلمات/دقيقة (افتراضي: 200)", default: 200 },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const wpm = Math.min(1000, Math.max(50, Number(params.wpm) || 200));

    if (!text) return { success: false, error: "text مطلوب" };

    try {
      const words = text.trim().split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const charCount = Array.from(text).length;
      const charCountNoSpaces = Array.from(text).filter((c) => !/\s/.test(c)).length;

      // different reading speeds (words per minute)
      const speeds = {
        slow: 100,
        average: 200,
        fast: 300,
        speed_reader: 500,
        skimming: 700,
        speaking: 130,
        auctioneer: 250,
      };

      const times: any = {};
      for (const [mode, speed] of Object.entries(speeds)) {
        const minutes = wordCount / speed;
        times[mode] = {
          words_per_minute: speed,
          minutes: Math.round(minutes * 10) / 10,
          seconds: Math.round(minutes * 60),
          formatted: formatTime(minutes),
        };
      }

      const customMinutes = wordCount / wpm;

      return {
        success: true,
        data: {
          word_count: wordCount,
          character_count: charCount,
          character_count_no_spaces: charCountNoSpaces,
          custom_wpm: wpm,
          custom_time: {
            minutes: Math.round(customMinutes * 10) / 10,
            seconds: Math.round(customMinutes * 60),
            formatted: formatTime(customMinutes),
          },
          reading_times: times,
          recommended: {
            reading: times.average,
            speaking: times.speaking,
            skimming: times.skimming,
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function formatTime(minutes: number): string {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} ثانية`;
  }
  if (minutes < 60) {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return secs > 0 ? `${mins} دقيقة و ${secs} ثانية` : `${mins} دقيقة`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours} ساعة و ${mins} دقيقة`;
}
