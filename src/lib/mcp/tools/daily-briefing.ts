/**
 * MCP Tool: Daily Briefing
 * ========================
 * سيناريو متكامل: "صباح الخير، إيه أخبار النهاردة؟"
 *
 * الخطوات:
 * 1. اجمع الأخبار من مصادر متعددة (HN + News + RSS)
 * 2. اجلب الطقس لموقع المستخدم
 * 3. شوف المهام المعلقة (من memory)
 * 4. لخّص كل حاجة في تقرير صباحي
 * 5. ابعت التقرير (اختياري)
 *
 * مستوحى من n8n templates:
 * - Daily Podcast Summary
 * - Receive Daily Market News
 * - Send daily translated Calvin and Hobbes
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";
import { getAllItems } from "../memory-store";

export const dailyBriefingTool: MCPTool = {
  name: "daily_briefing",
  description: "ملخص صباحي شامل: أخبار + طقس + مهام + تقويم. استخدمها لما المستخدم يقول 'صباح الخير' أو 'إيه أخبار النهاردة' أو 'ملخص اليوم'.",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "مدينة المستخدم للطقس (اختياري)" },
      lat: { type: "number", description: "خط العرض" },
      lng: { type: "number", description: "خط الطول" },
      newsCount: { type: "number", description: "عدد الأخبار (افتراضي: 5)", default: 5 },
      includeWeather: { type: "boolean", description: "ضم الطقس (افتراضي: true)", default: true },
      includeNews: { type: "boolean", description: "ضم الأخبار (افتراضي: true)", default: true },
      includeTasks: { type: "boolean", description: "ضم المهام (افتراضي: true)", default: true },
      sendTo: { type: "string", description: "إرسال للتليجرام/الواتساب (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const city = String(params.city || "").trim();
    let lat = Number(params.lat) || 0;
    let lng = Number(params.lng) || 0;
    const newsCount = Math.min(20, Math.max(1, Number(params.newsCount) || 5));
    const includeWeather = params.includeWeather !== false;
    const includeNews = params.includeNews !== false;
    const includeTasks = params.includeTasks !== false;
    const sendTo = String(params.sendTo || "").trim();

    try {
      const sections: any = {};
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // ═══ 1. الأخبار ═══
      if (includeNews) {
        try {
          // Hacker News top stories
          const hnRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
            signal: AbortSignal.timeout(10000),
          });
          if (hnRes.ok) {
            const ids: number[] = await hnRes.json();
            const topIds = ids.slice(0, newsCount);
            const stories = await Promise.all(
              topIds.map(async (id) => {
                try {
                  const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
                    signal: AbortSignal.timeout(5000),
                  });
                  return r.ok ? await r.json() : null;
                } catch { return null; }
              })
            );
            sections.news = stories.filter(Boolean).map((s: any) => ({
              title: s.title || "",
              url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
              score: s.score || 0,
              comments: s.descendants || 0,
            }));
          }
        } catch {}
      }

      // ═══ 2. الطقس ═══
      if (includeWeather) {
        try {
          // geocode if city provided
          if (city && (!lat || !lng)) {
            const geoRes = await fetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`,
              { signal: AbortSignal.timeout(10000) }
            );
            if (geoRes.ok) {
              const geoData: any = await geoRes.json();
              if (geoData.results?.[0]) {
                lat = geoData.results[0].latitude;
                lng = geoData.results[0].longitude;
              }
            }
          }

          if (lat && lng) {
            const weatherRes = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`,
              { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }
            );
            if (weatherRes.ok) {
              const wData: any = await weatherRes.json();
              const c = wData.current || {};
              const d = wData.daily || {};
              sections.weather = {
                location: city || `${lat},${lng}`,
                current_temp: c.temperature_2m,
                feels_like: c.apparent_temperature,
                humidity: c.relative_humidity_2m,
                wind_speed: c.wind_speed_10m,
                max_temp: d.temperature_2m_max?.[0],
                min_temp: d.temperature_2m_min?.[0],
                rain_probability: d.precipitation_probability_max?.[0] || 0,
                weather_code: c.weather_code,
              };
            }
          }
        } catch {}
      }

      // ═══ 3. المهام ═══
      if (includeTasks) {
        try {
          const tasks = getAllItems("tasks");
          sections.tasks = tasks.slice(-10).map((t) => ({
            key: t.key,
            value: String(t.value).slice(0, 200),
          }));
        } catch {}
      }

      // ═══ 4. التقويم / التاريخ ═══
      sections.calendar = {
        date: today,
        day: now.toLocaleDateString("ar-EG", { weekday: "long" }),
        time: now.toLocaleTimeString("ar-EG"),
        islamic_date: now.toLocaleDateString("ar-SA-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }),
      };

      // ═══ 5. اقتباس اليوم ═══
      try {
        const quoteRes = await fetch("https://api.adviceslip.com/advice", {
          signal: AbortSignal.timeout(5000),
        });
        if (quoteRes.ok) {
          const qData: any = await quoteRes.json();
          sections.quote = qData.slip?.advice || "";
        }
      } catch {}

      // ═══ 6. لخّص كل حاجة ═══
      const summary = await callGLMForJSON({
        systemPrompt: `أنت مساعد شخصي ذكي. حضّر ملخص صباحي شامل للمستخدم بناءً على البيانات التالية.
الملخص لازم يكون:
- بالعربية
- منظم ومناسب للقراءة الصباحية
- يحتوي على: الطقس، أهم الأخبار، المهام المعلقة، اقتباس اليوم

رجّع JSON:
{
  "greeting": "تحية صباحية شخصية",
  "weather_summary": "ملخص الطقس",
  "news_summary": ["أهم 3 أخبار"],
  "tasks_summary": ["المهام المعلقة"],
  "quote_of_day": "اقتباس",
  "full_briefing": "الملخص الكامل كنص جاهز للقراءة"
}`,
        userMessage: JSON.stringify(sections).slice(0, 4000),
        maxTokens: 1500,
        temperature: 0.5,
      });

      const briefing = summary.data || {};

      // ═══ 7. إرسال (اختياري) ═══
      let delivery: any = null;
      if (sendTo) {
        if (sendTo === "telegram") {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          const chatId = process.env.TELEGRAM_CHAT_ID;
          if (botToken && chatId) {
            try {
              const text = briefing.full_briefing || JSON.stringify(briefing, null, 2);
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), parse_mode: "HTML" }),
                signal: AbortSignal.timeout(10000),
              });
              delivery = { channel: "telegram", status: "sent" };
            } catch (e: any) {
              delivery = { channel: "telegram", status: "failed", error: e.message };
            }
          }
        }
      }

      return {
        success: true,
        data: {
          scenario: "daily_briefing",
          date: today,
          sections,
          briefing,
          delivery,
          steps_completed: {
            fetch_news: !!sections.news,
            fetch_weather: !!sections.weather,
            fetch_tasks: !!sections.tasks,
            generate_summary: !!briefing.full_briefing,
            send: delivery?.status === "sent",
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
