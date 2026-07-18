/**
 * MCP Tool: Content to HTML
 * سيناريو: ابحث → حوّل لمحتوى HTML احترافي
 * n8n template: "🔍 Perplexity Research to HTML: AI-Powered Content Creation"
 * 
 * الخطوات:
 * 1. ابحث في ويكيبيديا + HN عن الموضوع
 * 2. ولّد محتوى مقال
 * 3. حوّله لـ HTML احترافي
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const contentToHtmlTool: MCPTool = {
  name: "content_to_html",
  description: "بحث + توليد محتوى + HTML احترافي (سيناريو متكامل). استخدمها لما المستخدم يقول 'اكتب مقال HTML' أو 'content creation'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع المقال" },
      style: { type: "string", description: "أسلوب: article, blog, landing, newsletter (افتراضي: article)", default: "article" },
      language: { type: "string", description: "لغة: ar, en (افتراضي: ar)", default: "ar" },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "").trim();
    const style = String(params.style || "article").toLowerCase();
    const language = String(params.language || "ar").toLowerCase();
    if (!topic) return { success: false, error: "topic مطلوب" };

    try {
      // ═══ 1) ابحث في ويكيبيديا ═══
      let wikiInfo: any = null;
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`,
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
              wikiInfo = { title: sd.title, extract: sd.extract, url: sd.content_urls?.desktop?.page };
            }
          }
        }
      } catch {}

      // ═══ 2) ابحث في HN ═══
      let hnArticles: any[] = [];
      try {
        const hnRes = await fetch(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic.split(/\s+/).slice(0, 3).join(" "))}&tags=story&hitsPerPage=3`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (hnRes.ok) {
          const hd: any = await hnRes.json();
          hnArticles = (hd.hits || []).map((h: any) => ({ title: h.title || "", url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}` }));
        }
      } catch {}

      // ═══ 3) ولّد المحتوى + HTML ═══
      const researchData = `موضوع: ${topic}
ويكيبيديا: ${wikiInfo?.extract || "غير متاح"}
مقالات ذات صلة: ${hnArticles.map((h) => h.title).join("، ") || "غير متاح"}`;

      const content = await callGLMForJSON({
        systemPrompt: `أنت كاتب محتوى محترف. اكتب ${style === "blog" ? "مدونة" : style === "landing" ? "صفحة هبوط" : style === "newsletter" ? "نشرة بريدية" : "مقال"} عن "${topic}"${language === "ar" ? " بالعربية" : " in English"}.

بناءً على البحث: ${researchData}

رجّع JSON:
{
  "title": "عنوان جذاب",
  "meta_description": "وصف ميتا (160 حرف)",
  "content_html": "المحتوى الكامل بصيغة HTML (h1, h2, p, ul, li, blockquote)",
  "word_count": عدد,
  "tags": ["tag1", "tag2"]
}`,
        userMessage: topic,
        maxTokens: 2000,
        temperature: 0.6,
      });

      const result = content.data || {};

      // ═══ 4) لفّ في HTML كامل ═══
      const fullHtml = `<!DOCTYPE html>
<html lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${result.title || topic}</title>
  <meta name="description" content="${result.meta_description || ""}">
</head>
<body>
  <article>
    ${result.content_html || `<p>تعذر توليد المحتوى</p>`}
  </article>
  ${hnArticles.length > 0 ? `<section><h2>مصادر ذات صلة</h2><ul>${hnArticles.map((h) => `<li><a href="${h.url}">${h.title}</a></li>`).join("")}</ul></section>` : ""}
  ${wikiInfo ? `<section><h2>مرجع</h2><p><a href="${wikiInfo.url}">${wikiInfo.title} - ويكيبيديا</a></p></section>` : ""}
</body>
</html>`;

      return {
        success: true,
        data: {
          scenario: "content_to_html",
          topic,
          style,
          language,
          steps: {
            research: !!wikiInfo || hnArticles.length > 0,
            generate: !!result.content_html,
            html_wrap: true,
          },
          title: result.title || topic,
          meta_description: result.meta_description || "",
          content_html: result.content_html || "",
          full_html: fullHtml,
          word_count: result.word_count || 0,
          tags: result.tags || [],
          sources: {
            wikipedia: wikiInfo,
            hacker_news: hnArticles,
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
