/**
 * MCP Tool: Web Content Summarizer
 * سيناريو: اقرأ صفحة ويب → استخرج المحتوى → لخّص بالـ AI
 * n8n template: "Scrape and summarize webpages with AI"
 * 
 * الخطوات:
 * 1. Fetch الصفحة
 * 2. شيل HTML tags → نص نقي
 * 3. لخّص بالـ AI
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const webContentSummarizerTool: MCPTool = {
  name: "web_content_summarizer",
  description: "اقرا أي صفحة ويب ولخّصها بالـ AI (سيناريو متكامل). استخدمها لما المستخدم يقول 'لخّص المقال ده' أو 'summarize this page'.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "رابط الصفحة" },
      detailLevel: { type: "string", description: "مستوى التفصيل: brief, standard, detailed (افتراضي: standard)", default: "standard" },
      language: { type: "string", description: "لغة الملخص: ar, en (افتراضي: ar)", default: "ar" },
    },
    required: ["url"],
  },
  async execute(params) {
    const url = String(params.url || "").trim();
    const detailLevel = String(params.detailLevel || "standard").toLowerCase();
    const language = String(params.language || "ar").toLowerCase();
    if (!url) return { success: false, error: "url مطلوب" };
    if (!/^https?:\/\//i.test(url)) return { success: false, error: "url لازم تبدأ بـ http://" };

    try {
      // ═══ 1) Fetch الصفحة ═══
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });

      if (!res.ok) return { success: false, error: `فشل تحميل الصفحة: ${res.status}` };

      const html = await res.text();

      // ═══ 2) استخرج النص النقي ═══
      // شيل script و style
      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "");

      // استخرج العنوان
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";

      // استخرج meta description
      const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
      const metaDesc = descMatch ? descMatch[1] : "";

      // شيل باقي HTML tags
      text = text
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      // حد النص
      const maxLength = detailLevel === "detailed" ? 6000 : detailLevel === "brief" ? 2000 : 4000;
      const truncated = text.slice(0, maxLength);

      if (truncated.length < 50) {
        return { success: false, error: "الصفحة مفيهاش محتوى نصي كافي (ممكن تكون JS-rendered)" };
      }

      // ═══ 3) لخّص بالـ AI ═══
      const summary = await callGLMForJSON({
        systemPrompt: `أنت ملخّص محترف. لخّص المحتوى ده${language === "ar" ? " بالعربية" : " in English"}.
مستوى التفصيل: ${detailLevel === "brief" ? "مختصر (3-5 نقاط)" : detailLevel === "detailed" ? "مفصل (مع تفاصيل)" : "متوسط"}.

رجّع JSON:
{
  "title": "عنوان الصفحة",
  "summary": "الملخص الرئيسي",
  "key_points": ["نقطة 1", "نقطة 2", "نقطة 3"],
  "word_count_original": عدد,
  "word_count_summary": عدد
}`,
        userMessage: `العنوان: ${title}\nMeta: ${metaDesc}\n\nالمحتوى:\n${truncated}`,
        maxTokens: detailLevel === "detailed" ? 1500 : 800,
        temperature: 0.3,
      });

      const result = summary.data || {};

      return {
        success: true,
        data: {
          scenario: "web_content_summarizer",
          url,
          page_title: title,
          meta_description: metaDesc,
          original_length: text.length,
          steps: {
            fetch_page: true,
            extract_text: truncated.length > 50,
            summarize: !!result.summary,
          },
          summary: result.summary || "",
          key_points: result.key_points || [],
          compression_ratio: text.length > 0 ? Math.round((result.summary?.length || 0) / text.length * 100) + "%" : "unknown",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
