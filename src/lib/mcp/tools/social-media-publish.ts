/**
 * MCP Tool: Social Media Publisher
 * سيناريو: ترندات + محتوى متعدد المنصات + صورة + نشر
 * 
 * إصلاح: الـ prompt كان بيرجع بوست واحد بس. 
 * الحل: كرّر توليد المحتوى لكل منصة على حدة بدل ما تطلب الكل في call واحد.
 * 
 * n8n template: "AI Social Media Caption Creator + Social Media Analysis"
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";
import { getZAIClient } from "@/lib/zai-client";

export const socialMediaPublisherTool: MCPTool = {
  name: "social_media_publish",
  description: "نشر سوشيال ميديا متكامل — تحليل + محتوى لكل منصة + صورة (سيناريو متكامل). استخدمها لما المستخدم يقول 'انشر بوست' أو 'محتوى سوشيال'.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "موضوع البوست" },
      platforms: { type: "string", description: "المنصات: twitter, instagram, facebook, linkedin (مفصولة بفواصل)", default: "twitter,facebook" },
      tone: { type: "string", description: "النبرة: professional, casual, promotional, educational (افتراضي: casual)", default: "casual" },
      includeImage: { type: "boolean", description: "توليد صورة؟ (افتراضي: true)", default: true },
      autoPublish: { type: "boolean", description: "نشر تلقائي؟ (افتراضي: false)", default: false },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "").trim();
    const platformsStr = String(params.platforms || "twitter,facebook");
    const tone = String(params.tone || "casual");
    const includeImage = params.includeImage !== false;
    const autoPublish = Boolean(params.autoPublish);
    if (!topic) return { success: false, error: "topic مطلوب" };

    try {
      const platforms = platformsStr.split(/[,،]/).map((p) => p.trim().toLowerCase()).filter(Boolean);

      // ═══ 1) حلل الترندات (HN كـ proxy) ═══
      let trends: string[] = [];
      try {
        const hnRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { signal: AbortSignal.timeout(5000) });
        if (hnRes.ok) {
          const ids: number[] = await hnRes.json();
          const top3 = ids.slice(0, 3);
          const stories = await Promise.all(top3.map(async (id) => {
            const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(3000) });
            return r.ok ? await r.json() : null;
          }));
          trends = stories.filter(Boolean).map((s: any) => s.title);
        }
      } catch {}

      // ═══ 2) ولّد محتوى لكل منصة على حدة ═══
      const platformLimits: Record<string, number> = { twitter: 280, instagram: 2200, facebook: 5000, linkedin: 3000 };
      const posts: any[] = [];

      for (const platform of platforms) {
        const limit = platformLimits[platform] || 1000;
        const result = await callGLMForJSON({
          systemPrompt: `أنت كاتب سوشيال ميديا. اكتب بوست لـ ${platform} عن "${topic}".
النبرة: ${tone}.
الحد الأقصى: ${limit} حرف.
${trends.length > 0 ? `الترندات الحالية: ${trends.join("، ")}` : ""}

رجّع JSON بسيط:
{"content":"نص البوست","hashtags":["#tag1","#tag2"],"image_prompt":"وصف صورة"}`,
          userMessage: topic,
          maxTokens: 400,
          temperature: 0.7,
        });

        if (result.data?.content) {
          posts.push({
            platform,
            content: result.data.content,
            hashtags: result.data.hashtags || [],
            char_count: result.data.content.length,
            image_prompt: result.data.image_prompt || `social media post about ${topic}`,
            status: autoPublish ? "published (simulated)" : "draft",
          });
        }
      }

      // ═══ 3) ولّد صورة (لو مطلوب) ═══
      let imageData: any = null;
      if (includeImage && posts.length > 0) {
        const imagePrompt = posts[0]?.image_prompt || `social media post about ${topic}`;
        try {
          const zai = await getZAIClient();
          const imgRes = await zai.images.generations.create({
            model: "cogview-3-flash",
            prompt: imagePrompt,
            size: "1024x1024",
          });
          const base64 = imgRes?.data?.[0]?.base64 || "";
          if (base64) {
            imageData = { prompt: imagePrompt, data_url: `data:image/png;base64,${base64}`, generated: true };
          }
        } catch (e: any) {
          imageData = { prompt: imagePrompt, error: e.message, generated: false };
        }
      }

      return {
        success: true,
        data: {
          scenario: "social_media_publish",
          topic,
          platforms,
          tone,
          trends_analyzed: trends.length,
          posts,
          image: imageData,
          steps: {
            analyze_trends: trends.length > 0,
            generate_content: posts.length > 0,
            generate_image: !!imageData?.generated,
            publish: autoPublish,
          },
          note: autoPublish ? "تم النشر (محاكاة)." : "تم إنشاء drafts.",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
