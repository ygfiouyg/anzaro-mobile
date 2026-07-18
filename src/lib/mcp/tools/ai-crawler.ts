/**
 * MCP Tool: AI Crawler
 * النواة الصلبة #3: "Autonomous AI crawler"
 * 
 * الخطوات:
 * 1. ابدأ من URL أساسي
 * 2. استخرج الروابط الداخلية
 * 3. اقرأ محتوى كل صفحة
 * 4. حلل بالـ AI → استخرج معلومات منظّمة
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const aiCrawlerTool: MCPTool = {
  name: "ai_crawler",
  description: "زاحف ويب ذكي — يقرأ صفحة + يستخرج روابط + يحلل المحتوى (سيناريو متكامل). استخدمها لما المستخدم يقول 'ازحف موقع' أو 'crawler' أو 'استخرج من موقع'.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL البداية" },
      maxPages: { type: "number", description: "أقصى عدد صفحات (افتراضي: 3، أقصى: 10)", default: 3 },
      extractGoal: { type: "string", description: "هدف الاستخراج (مثلاً: أسعار، عناوين، معلومات اتصال)", default: "general" },
    },
    required: ["url"],
  },
  async execute(params) {
    const startUrl = String(params.url || "").trim();
    const maxPages = Math.min(10, Math.max(1, Number(params.maxPages) || 3));
    const goal = String(params.extractGoal || "general");
    if (!startUrl) return { success: false, error: "url مطلوب" };
    if (!/^https?:\/\//i.test(startUrl)) return { success: false, error: "url لازم تبدأ بـ http" };

    try {
      let baseUrl: string;
      try { baseUrl = new URL(startUrl).origin; } catch { baseUrl = startUrl; }
      const visited = new Set<string>();
      const results: any[] = [];

      // ═══ الخطوة 1: اقرأ الصفحة الأولى ═══
      let currentUrl = startUrl;
      for (let i = 0; i < maxPages; i++) {
        if (visited.has(currentUrl)) break;
        visited.add(currentUrl);

        let pageContent = "";
        let pageTitle = "";
        let links: string[] = [];

        try {
          const res = await fetch(currentUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
          });
          if (!res.ok) break;
          const html = await res.text();

          // استخرج العنوان
          const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          pageTitle = tMatch ? tMatch[1].trim() : "";

          // شيل script/style
          let text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");

          // استخرج روابط داخلية
          const linkRegex = /href="(\/[^"]*|https?:\/\/[^"]*)"/g;
          let lm;
          while ((lm = linkRegex.exec(text)) && links.length < 20) {
            let link = lm[1];
            if (link.startsWith("/")) link = baseUrl + link;
            if (link.startsWith(baseUrl) && !visited.has(link) && !link.includes("#")) {
              links.push(link);
            }
          }

          // استخرج نص
          text = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
          pageContent = text.slice(0, 3000);
        } catch { break; }

        // ═══ الخطوة 2: حلل المحتوى ═══
        const analysis = await callGLMForJSON({
          systemPrompt: `أنت زاحف ذكي. حلل الصفحة دي (الهدف: ${goal}).
المحتوى:\n${pageContent.slice(0, 1500)}

رجّع JSON: {"title":"","relevant_content":"","key_data":[],"page_type":""}`,
          userMessage: pageTitle,
          maxTokens: 400,
          temperature: 0.3,
        });

        results.push({
          url: currentUrl,
          title: pageTitle,
          page_type: analysis.data?.page_type || "unknown",
          relevant_content: analysis.data?.relevant_content || "",
          key_data: analysis.data?.key_data || [],
        });

        // الانتقال للرابط التالي
        if (links.length > 0) {
          currentUrl = links[0];
        } else {
          break;
        }
      }

      return {
        success: true,
        data: {
          scenario: "ai_crawler",
          start_url: startUrl,
          goal,
          pages_crawled: results.length,
          steps: {
            fetch_pages: results.length > 0,
            extract_links: true,
            analyze_content: results.length > 0,
          },
          results,
          total_links_found: visited.size,
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
