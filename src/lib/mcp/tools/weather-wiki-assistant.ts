/**
 * MCP Tool: Weather Wiki Assistant
 * سيناريو: ابحث عن مدينة → طقس + معلومات ويكيبيديا → تقرير شامل
 * n8n template: "AI Agent with Ollama for current weather and wiki"
 * 
 * الخطوات:
 * 1. ابحث عن المدينة في ويكيبيديا
 * 2. اجلب الطقس الحالي
 * 3. ولّد تقرير شامل يجمع الاثنين
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const weatherWikiAssistantTool: MCPTool = {
  name: "weather_wiki_assistant",
  description: "طقس + معلومات ويكيبيديا لأي مدينة (سيناريو متكامل). استخدمها لما المستخدم يقول 'حكيلي عن القاهرة' أو 'معلومات + طقس مدينة'.",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "اسم المدينة" },
    },
    required: ["city"],
  },
  async execute(params) {
    const city = String(params.city || "").trim();
    if (!city) return { success: false, error: "city مطلوب" };

    try {
      // ═══ 1) ويكيبيديا ═══
      let wikiInfo: any = null;
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(city)}&srlimit=1&format=json&origin=*`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (wikiRes.ok) {
          const wd: any = await wikiRes.json();
          const result = wd.query?.search?.[0];
          if (result) {
            const sumRes = await fetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(result.title)}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (sumRes.ok) {
              const sd: any = await sumRes.json();
              wikiInfo = {
                title: sd.title || "",
                extract: (sd.extract || "").slice(0, 500),
                url: sd.content_urls?.desktop?.page || "",
                coordinates: sd.coordinates || null,
              };
            }
          }
        }
      } catch {}

      // ═══ 2) Geocoding + الطقس ═══
      let weather: any = null;
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (geoRes.ok) {
          const gd: any = await geoRes.json();
          if (gd.results?.[0]) {
            const r = gd.results[0];
            const lat = r.latitude;
            const lng = r.longitude;
            const wRes = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (wRes.ok) {
              const wd: any = await wRes.json();
              const c = wd.current || {};
              const d = wd.daily || {};
              weather = {
                location: `${r.name}, ${r.country}`,
                latitude: lat,
                longitude: lng,
                current_temp: c.temperature_2m,
                feels_like: c.apparent_temperature,
                humidity: c.relative_humidity_2m,
                wind_speed: c.wind_speed_10m,
                weather_code: c.weather_code,
                max_temp: d.temperature_2m_max?.[0],
                min_temp: d.temperature_2m_min?.[0],
                rain_probability: d.precipitation_probability_max?.[0] || 0,
              };
            }
          }
        }
      } catch {}

      // ═══ 3) تقرير شامل ═══
      const report = await callGLMForJSON({
        systemPrompt: `أنت مساعد ذكي. حضّر تقرير عن مدينة "${city}".
رجّع JSON: {"summary":"ملخص 3 أسطر يجمع المعلومات والطقس","weather_advice":"نصيحة بناء على الطقس","city_facts":["معلومة 1","معلومة 2"]}`,
        userMessage: `ويكيبيديا: ${wikiInfo?.extract || "غير متاح"}\nطقس: ${JSON.stringify(weather || {})}`.slice(0, 1000),
        maxTokens: 400,
        temperature: 0.5,
      });

      return {
        success: true,
        data: {
          scenario: "weather_wiki_assistant",
          city,
          steps: { wiki: !!wikiInfo, weather: !!weather, report: !!report.data?.summary },
          wikipedia: wikiInfo,
          weather: weather,
          report: report.data || {},
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
