/**
 * Recipes System
 * ===============
 * سيناريوهات جاهزة = سلسلة MCP tools
 * الـ AI بيختار الـ recipe المناسب وينفذ كل الـ tools لوحده.
 */

export interface RecipeStep {
  tool: string;
  description: string;
  params: (input: string, previousResults: Record<string, unknown>) => Record<string, unknown>;
  outputKey: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  steps: RecipeStep[];
}

export const RECIPES: Recipe[] = [
  {
    id: "youtube_video_creation",
    name: "إنشاء فيديو يوتيوب كامل",
    description: "سكريبت + فيديو + صوت + رفع على يوتيوب",
    trigger: ["اعمل فيديو", "youtube video", "ارفع فيديو", "content pipeline"],
    steps: [
      {
        tool: "translate",
        description: "اكتب سكريبت للفيديو",
        params: (input) => ({ text: `اكتب سكريبت فيديو قصير عن: ${input}`, targetLanguage: "ar" }),
        outputKey: "script",
      },
      {
        tool: "video_generate",
        description: "ولّد فيديو من السكريبت",
        params: (_input, prev) => ({ prompt: String(prev.script || "").slice(0, 500) }),
        outputKey: "video",
      },
      {
        tool: "tts_generate",
        description: "حوّل السكريبت لصوت",
        params: (_input, prev) => ({ text: String(prev.script || "").slice(0, 5000), voice: "ar" }),
        outputKey: "audio",
      },
    ],
  },
  {
    id: "social_media_post",
    name: "بوست سوشيال ميديا كامل",
    description: "محتوى + صورة + hashtags",
    trigger: ["بوست", "social media", "انستجرام", "فيسبوك", "تويتر"],
    steps: [
      {
        tool: "translate",
        description: "اكتب محتوى السوشيال",
        params: (input) => ({ text: `اكتب بوست سوشيال ميديا احترافي عن: ${input}`, targetLanguage: "ar" }),
        outputKey: "caption",
      },
      {
        tool: "image_generate",
        description: "ولّد صورة للبوست",
        params: (input) => ({ prompt: input }),
        outputKey: "image",
      },
    ],
  },
  {
    id: "news_report",
    name: "تقرير إخباري",
    description: "بحث ويب + كتابة خبر + مصادر",
    trigger: ["خبر", "news", "اخبار", "تقرير"],
    steps: [
      {
        tool: "web_search",
        description: "ابحث عن الموضوع",
        params: (input) => ({ query: input, num: 5 }),
        outputKey: "searchResults",
      },
      {
        tool: "translate",
        description: "اكتب الخبر بناءً على النتائج",
        params: (input, prev) => ({
          text: `اكتب خبر صحفي عن: ${input}\n\nبناءً على: ${JSON.stringify(prev.searchResults).slice(0, 2000)}`,
          targetLanguage: "ar",
        }),
        outputKey: "article",
      },
    ],
  },
  {
    id: "research_deep",
    name: "بحث عميق",
    description: "بحث متعدد + تلخيص + تقرير",
    trigger: ["بحث", "research", "ادرس", "حلل موضوع"],
    steps: [
      {
        tool: "web_search",
        description: "ابحث من مصدر أول",
        params: (input) => ({ query: input, num: 5 }),
        outputKey: "search1",
      },
      {
        tool: "web_search",
        description: "ابحث من زاوية تانية",
        params: (input) => ({ query: `${input} statistics analysis 2025`, num: 5 }),
        outputKey: "search2",
      },
      {
        tool: "translate",
        description: "اعمل تقرير شامل",
        params: (input, prev) => ({
          text: `اعمل تقرير بحثي شامل عن: ${input}\n\nالمصادر:\n${JSON.stringify(prev.search1).slice(0, 1000)}\n\n${JSON.stringify(prev.search2).slice(0, 1000)}`,
          targetLanguage: "ar",
        }),
        outputKey: "report",
      },
    ],
  },
  {
    id: "translate_content",
    name: "ترجمة + توليد صوت",
    description: "ترجم نص + حوّله لصوت",
    trigger: ["ترجم واقرا", "translate and speak"],
    steps: [
      {
        tool: "translate",
        description: "ترجم النص",
        params: (input) => {
          const parts = input.split(" to ");
          return { text: parts[0] || input, targetLanguage: parts[1] || "ar" };
        },
        outputKey: "translation",
      },
      {
        tool: "tts_generate",
        description: "اقرا الترجمة",
        params: (_input, prev) => ({ text: String(prev.translation || ""), voice: "ar" }),
        outputKey: "audio",
      },
    ],
  },
  {
    id: "content_calendar",
    name: "تقويم محتوى أسبوعي",
    description: "7 أفكار محتوى + تصنيف + جدولة",
    trigger: ["تقويم محتوى", "content calendar", "جدول نشر", "خطة محتوى"],
    steps: [
      {
        tool: "translate",
        description: "ولّد 7 أفكار محتوى",
        params: (input) => ({
          text: `اعمل تقويم محتوى أسبوعي (7 أيام) عن: ${input}. لكل يوم: عنوان + فكرة + منصة مناسبة. رجّع JSON array.`,
          targetLanguage: "ar",
        }),
        outputKey: "calendar",
      },
      {
        tool: "memory_set",
        description: "احفظ التقويم",
        params: (input, prev) => ({ key: "content_calendar", value: String(prev.calendar || "") }),
        outputKey: "saved",
      },
    ],
  },
  {
    id: "brand_analysis",
    name: "تحليل علامة تجارية",
    description: "بحث + تحليل + تقرير",
    trigger: ["حلل علامة", "brand analysis", "حلل شركة"],
    steps: [
      {
        tool: "web_search",
        description: "ابحث عن العلامة",
        params: (input) => ({ query: `${input} brand market share competitors`, num: 5 }),
        outputKey: "search",
      },
      {
        tool: "translate",
        description: "اعمل تحليل شامل",
        params: (input, prev) => ({
          text: `حلل العلامة التجارية: ${input}\n\nالبيانات:\n${JSON.stringify(prev.search).slice(0, 2000)}\n\nاعمل: SWOT + حصة سوقية + منافسين + توصيات`,
          targetLanguage: "ar",
        }),
        outputKey: "analysis",
      },
    ],
  },
  {
    id: "weather_brief",
    name: "نشرة جو + نصيحة",
    description: "الجو + نصيحة ملابس/نشاط",
    trigger: ["الجو", "weather", "حرارة", "طقس"],
    steps: [
      {
        tool: "weather_get",
        description: "احصل على حالة الجو",
        params: (input) => {
          const cities = ["cairo", "riyadh", "dubai", "london", "paris", "new york", "tokyo"];
          const found = cities.find(c => input.toLowerCase().includes(c)) || "cairo";
          return { city: found };
        },
        outputKey: "weather",
      },
      {
        tool: "translate",
        description: "اعمل نصيحة بناءً على الجو",
        params: (input, prev) => ({
          text: `بناءً على بيانات الجو: ${JSON.stringify(prev.weather)}\nاعمل نصيحة قصيرة عن الملابس المناسبة والنشاط الموصى به. بالعربي.`,
          targetLanguage: "ar",
        }),
        outputKey: "advice",
      },
    ],
  },
  {
    id: "document_creation",
    name: "إنشاء مستند كامل",
    description: "محتوى + مستند Word/Excel/PPTX",
    trigger: ["اعمل ملف", "word", "excel", "powerpoint", "مستند"],
    steps: [
      {
        tool: "translate",
        description: "اكتب محتوى المستند",
        params: (input) => ({ text: `اكتب محتوى احترافي عن: ${input}`, targetLanguage: "ar" }),
        outputKey: "content",
      },
      {
        tool: "document_generate",
        description: "ولّد المستند",
        params: (input) => ({
          topic: input,
          type: input.toLowerCase().includes("excel") ? "xlsx" : input.toLowerCase().includes("powerpoint") || input.toLowerCase().includes("عرض") ? "pptx" : "docx",
          language: "ar",
        }),
        outputKey: "document",
      },
    ],
  },
  {
    id: "rss_monitor",
    name: "مراقبة أخبار + تلخيص",
    description: "اقرا RSS + لخص الأخبار",
    trigger: ["rss", "اخبار موقع", "feed"],
    steps: [
      {
        tool: "rss_fetch",
        description: "اقرا الـ RSS feed",
        params: (input) => {
          const urlMatch = input.match(/https?:\/\/[^\s]+/);
          return { url: urlMatch ? urlMatch[0] : "https://feeds.bbci.co.uk/news/rss.xml", maxItems: 5 };
        },
        outputKey: "feed",
      },
      {
        tool: "translate",
        description: "لخص الأخبار",
        params: (input, prev) => ({
          text: `لخص الأخبار دي:\n${JSON.stringify(prev.feed).slice(0, 2000)}\nاعمل ملخص قصير لكل خبر.`,
          targetLanguage: "ar",
        }),
        outputKey: "summary",
      },
    ],
  },
];

/** البحث عن recipe مناسب لرسالة المستخدم */
export function findRecipe(message: string): Recipe | null {
  const lower = message.toLowerCase();
  for (const recipe of RECIPES) {
    for (const trigger of recipe.trigger) {
      if (lower.includes(trigger.toLowerCase())) {
        return recipe;
      }
    }
  }
  return null;
}

/** قائمة كل الـ recipes */
export function listRecipes() {
  return RECIPES.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    steps: r.steps.length,
    tools: r.steps.map((s) => s.tool),
  }));
}
