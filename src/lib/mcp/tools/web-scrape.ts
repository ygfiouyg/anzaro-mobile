/**
 * MCP Tool: Web Scrape
 * =====================
 * فكرة من: AI Powered Web Scraping with Jina
 * يقرا صفحة ويب + يستخرج بيانات + يحلل
 */
import type { MCPTool } from "../types";
import { getZAIClient } from "@/lib/zai-client";

export const webScrapeTool: MCPTool = {
  name: "web_scrape",
  description: "اقرا صفحة ويب + استخرج بيانات + حلل. استخدمها لما المستخدم يقول 'scrape' أو 'استخرج بيانات' أو 'حلل موقع'.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "رابط الصفحة" },
      extractType: { type: "string", description: "نوع الاستخراج: text, links, images, structured", enum: ["text", "links", "images", "structured"], default: "text" },
    },
    required: ["url"],
  },
  async execute(params) {
    const url = String(params.url || "");
    const extractType = String(params.extractType || "text");
    if (!url) return { success: false, error: "url مطلوب" };
    if (!url.startsWith("http")) return { success: false, error: "url غير صحيح" };
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const html = await res.text();
      
      // استخراج حسب النوع
      let extracted: string;
      switch (extractType) {
        case "links": {
          const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]).filter(Boolean);
          extracted = JSON.stringify([...new Set(links)].slice(0, 50));
          break;
        }
        case "images": {
          const images = [...html.matchAll(/src="(https?:\/\/[^"]+\.(jpg|png|gif|webp)[^"]*)"/gi)].map(m => m[1]).filter(Boolean);
          extracted = JSON.stringify([...new Set(images)].slice(0, 30));
          break;
        }
        case "structured": {
          // استخراج title + meta + headings
          const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || "";
          const desc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i)?.[1] || "";
          const headings = [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
          extracted = JSON.stringify({ title, description: desc, headings: headings.slice(0, 20) });
          break;
        }
        default: {
          // نص نظيف
          extracted = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10000);
        }
      }

      // لو النص كبير، لخصه بـ GLM
      if (extracted.length > 3000) {
        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model: "glm-5.2",
          messages: [{ role: "system", content: "لخص المحتوى التالي في نقاط رئيسية:" }, { role: "user", content: extracted.slice(0, 8000) }],
          max_tokens: 1000, temperature: 0.3,
        });
        const summary = completion?.choices?.[0]?.message?.content || "";
        return { success: true, data: { url, extractType, content: extracted.slice(0, 2000), summary } };
      }

      return { success: true, data: { url, extractType, content: extracted } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
