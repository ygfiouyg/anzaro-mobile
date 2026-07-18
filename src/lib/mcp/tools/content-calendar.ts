/**
 * MCP Tool: Content Calendar (Scenario)
 * سيناريو متعدد الخطوات: توليد تقويم محتوى 30 يوم + ثيمات + أفضل أوقات
 *
 * الخطوات:
 *  1) التحقق + تقسيم platforms
 *  2) حساب التواريخ لـ 30 يوم من اليوم الحالي
 *  3) استدعاء GLM لتوليد التقويم + الثيمات + أفضل الأوقات
 *  4) التحقق من وجود 30 يوم + إكمال التواريخ الناقصة
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const CONTENT_TYPES = ["post", "video", "story", "reel", "carousel", "article"];

export const contentCalendarTool: MCPTool = {
  name: "content_calendar",
  description:
    "ولّد تقويم محتوى 30 يوم + ثيمات + أفضل أوقات. استخدمها لما المستخدم يقول 'تقويم محتوى' أو 'content calendar' أو 'خطة محتوى'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع المحتوى" },
      month: { type: "string", description: "الشهر (مثال: 2024-12) — افتراضي: الشهر الحالي" },
      platforms: {
        type: "string",
        description: "المنصات (مفصولة بفواصل): instagram, twitter, linkedin, tiktok, youtube",
      },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "").trim();
    const monthInput = String(params.month || "").trim();
    const platformsInput = String(params.platforms || "").trim();
    if (!topic) return { success: false, error: "topic مطلوب" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + split platforms ═══
      const platforms = platformsInput
        ? platformsInput
            .split(/[,،\n;]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : ["instagram", "twitter"];
      stepsCompleted.push("parse_platforms");

      // ═══ Step 2: Compute 30 dates ═══
      const startDate = monthInput
        ? (() => {
            const [y, m] = monthInput.split("-").map((x) => parseInt(x, 10));
            return new Date(y, (m || 1) - 1, 1);
          })()
        : new Date();

      const dateList: string[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        dateList.push(formatDate(d));
      }
      stepsCompleted.push("compute_dates");

      // ═══ Step 3: AI generation — calendar + themes + best times ═══
      const systemPrompt = `ولّد تقويم محتوى 30 يوم عن ${topic} لـ ${platforms.join("، ")}.
رجّع JSON فقط:
{"calendar":[{"day":1,"date":"","title":"","type":"","platform":"","description":""}],"themes":[],"best_times":[],"strategy":""}
- calendar فيه 30 إدخال (day من 1 لـ 30).
- type واحد من: ${CONTENT_TYPES.join(", ")}.
- platform واحد من: ${platforms.join(", ")}.
- date بصيغة YYYY-MM-DD.
- themes 3-5 ثيمات أسبوعية.
- best_times: أفضل أوقات النشر لكل منصة.
- strategy: 2-3 أسطر.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الموضوع: ${topic}. المنصات: ${platforms.join("، ")}.`,
        maxTokens: 3000,
        temperature: 0.6,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_generate_calendar");

      // ═══ Step 4: Validate 30 entries + fill missing dates ═══
      const data = result.data || {};
      let calendar = Array.isArray(data.calendar) ? data.calendar : [];

      // ادمج مع dateList: لو النتائج أقل من 30، أكملها بـ placeholders
      calendar = dateList.map((date, i) => {
        const existing = calendar[i] || calendar.find((c: any) => c.day === i + 1);
        const typeValid = existing && CONTENT_TYPES.includes(String(existing.type || ""));
        const platformValid =
          existing && platforms.includes(String(existing.platform || ""));
        return {
          day: i + 1,
          date: String(existing?.date || date),
          title: String(existing?.title || `محتوى ${topic} - يوم ${i + 1}`),
          type: typeValid ? String(existing.type) : "post",
          platform: platformValid ? String(existing.platform) : platforms[0] || "instagram",
          description: String(existing?.description || ""),
        };
      });

      const themes = Array.isArray(data.themes)
        ? data.themes.map((t: any) => String(t))
        : [];
      const bestTimes = Array.isArray(data.best_times)
        ? data.best_times.map((b: any) => String(b))
        : [];
      stepsCompleted.push("validate_fill_dates");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "content_calendar",
          topic,
          platforms,
          start_date: dateList[0],
          end_date: dateList[dateList.length - 1],
          calendar,
          calendar_entries: calendar.length,
          themes,
          best_times: bestTimes,
          strategy: String(data.strategy || ""),
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
