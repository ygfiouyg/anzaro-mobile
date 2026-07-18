/**
 * MCP Tool: Social Media Calendar (Scenario)
 * سيناريو متعدد الخطوات: تقويم سوشيال ميديا 30 يوم + ثيمات أسبوعية + أفضل الأوقات
 *
 * الخطوات:
 *  1) التحقق + تقسيم platforms
 *  2) حساب 30 يوم + استخراج أيام الأسبوع لكل يوم
 *  3) استدعاء GLM لتوليد التقويم + الثيمات + أفضل الأوقات + الاستراتيجية
 *  4) التحقق من 30 إدخال + إكمال التواريخ + تصحيح content_type
 *  5) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

const PLATFORMS = ["instagram", "twitter", "facebook", "linkedin", "tiktok", "youtube"];
const CONTENT_TYPES = ["post", "video", "story", "reel"];

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayName(d: Date): string {
  const names = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  return names[d.getDay()];
}

export const socialMediaCalendarTool: MCPTool = {
  name: "social_media_calendar",
  description:
    "ولّد تقويم سوشيال ميديا 30 يوم (بوست/فيديو/ستوري/ريل + كابشن + هاشتاجات) + ثيمات أسبوعية + أفضل الأوقات. استخدمها لما المستخدم يقول 'تقويم سوشيال' أو 'social media calendar'.",
  parameters: {
    type: "object",
    properties: {
      brand: { type: "string", description: "اسم العلامة التجارية" },
      month: { type: "string", description: "الشهر (مثال: 2024-12) — افتراضي: من اليوم" },
      platforms: {
        type: "string",
        description: "المنصات (مفصولة بفواصل): instagram, twitter, facebook, linkedin, tiktok, youtube",
      },
      tone: { type: "string", description: "النبرة (مثال: رسمي، ودود، مرح، احترافي)" },
    },
    required: ["brand", "platforms"],
  },
  async execute(params) {
    const brand = String(params.brand || "").trim();
    const monthInput = String(params.month || "").trim();
    const platformsInput = String(params.platforms || "").trim();
    const tone = String(params.tone || "").trim();

    if (!brand) return { success: false, error: "brand مطلوب" };
    if (!platformsInput) return { success: false, error: "platforms مطلوبة" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Parse platforms ═══
      const platforms = platformsInput
        .split(/[,،\n;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
        .filter((s) => PLATFORMS.includes(s));
      if (platforms.length === 0) {
        return { success: false, error: `platforms غير صالحة. اختر من: ${PLATFORMS.join(", ")}` };
      }
      stepsCompleted.push("parse_platforms");

      // ═══ Step 2: Compute 30 dates + weekdays ═══
      const startDate = monthInput
        ? (() => {
            const [y, m] = monthInput.split("-").map((x) => parseInt(x, 10));
            return new Date(y, (m || 1) - 1, 1);
          })()
        : new Date();

      const dateList: { date: string; weekday: string }[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        dateList.push({ date: formatDate(d), weekday: weekdayName(d) });
      }
      stepsCompleted.push("compute_dates");

      // ═══ Step 3: AI generation ═══
      const systemPrompt = `ولّد تقويم سوشيال ميديا 30 يوم لـ ${brand} على ${platforms.join("، ")}.
النبرة: ${tone || "احترافية"}.
رجّع JSON فقط:
{"calendar":[{"day":1,"platform":"","content_type":"post","topic":"","caption":"","hashtags":[]}],"weekly_themes":[],"best_times":[],"strategy":""}
- calendar فيه 30 إدخال (day من 1 لـ 30).
- platform واحدة من: ${platforms.join(", ")}.
- content_type واحد من: ${CONTENT_TYPES.join(", ")}.
- caption 1-3 أسطر جذابة.
- hashtags 5-10 هاشتاجات بدون #.
- weekly_themes 4 ثيمات.
- best_times أفضل أوقات النشر لكل منصة.
- strategy 2-3 أسطر.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `العلامة: ${brand}. المنصات: ${platforms.join("، ")}. النبرة: ${tone}.`,
        maxTokens: 3500,
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

      // ═══ Step 4: Validate + fill missing + fix content_type ═══
      const data = result.data || {};
      let calendar = Array.isArray(data.calendar) ? data.calendar : [];

      calendar = dateList.map((dInfo, i) => {
        const existing = calendar[i] || calendar.find((c: any) => c.day === i + 1);
        const typeValid =
          existing && CONTENT_TYPES.includes(String(existing.content_type || ""));
        const platformValid =
          existing && platforms.includes(String(existing.platform || "").toLowerCase());
        const hashtags = Array.isArray(existing?.hashtags)
          ? existing.hashtags.map((h: any) => String(h).replace(/^#/, ""))
          : [];
        return {
          day: i + 1,
          date: dInfo.date,
          weekday: dInfo.weekday,
          platform: platformValid ? String(existing.platform).toLowerCase() : platforms[0],
          content_type: typeValid ? String(existing.content_type) : "post",
          topic: String(existing?.topic || `${brand} - يوم ${i + 1}`),
          caption: String(existing?.caption || ""),
          hashtags,
        };
      });

      const weeklyThemes = Array.isArray(data.weekly_themes)
        ? data.weekly_themes.map((t: any) => String(t))
        : [];
      const bestTimes = Array.isArray(data.best_times)
        ? data.best_times.map((b: any) => String(b))
        : [];
      stepsCompleted.push("validate_fill_entries");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "social_media_calendar",
          brand,
          platforms,
          tone: tone || "احترافية",
          start_date: dateList[0].date,
          end_date: dateList[dateList.length - 1].date,
          calendar,
          calendar_entries: calendar.length,
          weekly_themes: weeklyThemes,
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
