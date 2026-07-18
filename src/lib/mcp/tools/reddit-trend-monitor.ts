/**
 * MCP Tool: Reddit Trend Monitor
 * سيناريو: جمع بوستات Reddit → تحليل ترندات → تقرير
 * 
 * إصلاح: Reddit API بيرفض من HF IP (403).
 * الحل: استخدم RSS feed بدل JSON API — RSS مش محمي بـ rate limit.
 * 
 * n8n template: "SocialPulse Lite - Reddit Trend Monitor"
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const redditTrendMonitorTool: MCPTool = {
  name: "reddit_trend_monitor",
  description: "مراقبة ترندات Reddit — جمع + تحليل + تقرير (سيناريو متكامل). استخدمها لما المستخدم يقول 'ترندات Reddit' أو 'مين بيتكلم عن إيه'.",
  parameters: {
    type: "object",
    properties: {
      subreddit: { type: "string", description: "اسم الـ subreddit (مثلاً: programming)" },
      topic: { type: "string", description: "موضوع محدد (اختياري)" },
      count: { type: "number", description: "عدد البوستات (افتراضي: 10)", default: 10 },
    },
    required: ["subreddit"],
  },
  async execute(params) {
    const subreddit = String(params.subreddit || "").trim().toLowerCase().replace(/^r\//, "");
    const topic = String(params.topic || "").trim();
    const count = Math.min(25, Math.max(5, Number(params.count) || 10));
    if (!subreddit) return { success: false, error: "subreddit مطلوب" };

    try {
      // ═══ الخطوة 1: اجلب البوستات عبر RSS ═══
      let posts: any[] = [];
      
      // جرّب RSS feed أولاً (مش محمي بـ rate limit)
      try {
        const rssRes = await fetch(`https://www.reddit.com/r/${subreddit}/.rss?limit=${count}`, {
          headers: { "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (rssRes.ok) {
          const xml = await rssRes.text();
          // parse RSS XML بـ regex بسيط
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
          let match;
          while ((match = entryRegex.exec(xml)) !== null && posts.length < count) {
            const entry = match[1];
            const title = entry.match(/<title>([^<]+)<\/title>/)?.[1] || "";
            const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
            const author = entry.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/)?.[1] || "";
            const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || "";
            const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
            
            if (title) {
              posts.push({
                title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
                url: link,
                author: author,
                published: published,
                content: content.slice(0, 300),
              });
            }
          }
        }
      } catch {}

      // لو RSS فشل، جرّب old.reddit.com JSON
      if (posts.length === 0) {
        try {
          const jsonRes = await fetch(`https://old.reddit.com/r/${subreddit}/hot.json?limit=${count}`, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; DeltaAI/1.0)" },
            signal: AbortSignal.timeout(10000),
          });
          if (jsonRes.ok) {
            const data: any = await jsonRes.json();
            posts = (data.data?.children || []).map((p: any) => ({
              title: p.data?.title || "",
              url: `https://reddit.com${p.data?.permalink || ""}`,
              author: p.data?.author || "",
              score: p.data?.score || 0,
              comments: p.data?.num_comments || 0,
              content: (p.data?.selftext || "").slice(0, 300),
            }));
          }
        } catch {}
      }

      // لو كله فشل، استخدم Hacker News كبديل
      if (posts.length === 0) {
        return {
          success: false,
          error: `Reddit API مش متاح من هذا الخادم. جرّب ai_research_agent كبديل للبحث.`,
          subreddit,
          attempted: ["RSS", "old.reddit.com JSON"],
        };
      }

      // فلترة بالـ topic لو موجود
      if (topic) {
        const t = topic.toLowerCase();
        posts = posts.filter((p) => p.title.toLowerCase().includes(t) || (p.content || "").toLowerCase().includes(t));
      }

      // ═══ الخطوة 2: تحليل ═══
      const analysis = await callGLMForJSON({
        systemPrompt: `أنت محلل سوشيال ميديا. حلل ${posts.length} بوست من r/${subreddit}.
استخرج: الترندات، المواضيع الشائعة، الأسئلة المتكررة.
رجّع JSON: {"trends":[{"topic":"","count":0}],"common_questions":[],"summary":"","insights":[]}`,
        userMessage: posts.map((p) => p.title).join("\n").slice(0, 2000),
        maxTokens: 1000,
        temperature: 0.4,
      });

      return {
        success: true,
        data: {
          scenario: "reddit_trend_monitor",
          subreddit: `r/${subreddit}`,
          topic: topic || null,
          posts_fetched: posts.length,
          steps: { fetch: posts.length > 0, analyze: !!analysis.data?.summary },
          top_posts: posts.slice(0, 5),
          trends: analysis.data?.trends || [],
          common_questions: analysis.data?.common_questions || [],
          summary: analysis.data?.summary || "",
          insights: analysis.data?.insights || [],
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
