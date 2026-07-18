/**
 * MCP Tool: YouTube Insights
 * سيناريو: تحليل فيديو يوتيوب + تعليقات → تقرير
 * 
 * إصلاح: يوتيوب بيحمّل التعليقات بـ JavaScript — scraping مستحيل.
 * الحل: 
 * 1. معلومات الفيديو (oEmbed) — شغّال
 * 2. التعليقات — اقبلها كـ input اختياري
 * 3. لو مفيش تعليقات، حلل عنوان الفيديو + الوصف فقط
 * 
 * n8n template: "Extract insights & analyse YouTube comments via AI Agent chat"
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const youtubeInsightsTool: MCPTool = {
  name: "youtube_insights",
  description: "تحليل فيديو يوتيوب + تعليقات — استخراج + تحليل + تقرير (سيناريو متكامل). استخدمها لما المستخدم يقول 'حلل فيديو يوتيوب'. اقبل التعليقات كـ input اختياري.",
  parameters: {
    type: "object",
    properties: {
      videoUrl: { type: "string", description: "رابط الفيديو" },
      videoId: { type: "string", description: "ID الفيديو (بديل)" },
      comments: { type: "string", description: "نص التعليقات (اختياري — كل تعليق في سطر)" },
    },
    required: [],
  },
  async execute(params) {
    let videoId = String(params.videoId || "").trim();
    const videoUrl = String(params.videoUrl || "").trim();
    const commentsText = String(params.comments || "").trim();
    
    if (!videoId && videoUrl) { const m = videoUrl.match(/(?:v=|youtu\.be\/)([\w-]{11})/); if (m) videoId = m[1]; }
    if (!videoId) return { success: false, error: "videoUrl أو videoId مطلوب" };

    try {
      // ═══ 1) معلومات الفيديو (oEmbed — شغّال) ═══
      let videoInfo: any = {};
      try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, { signal: AbortSignal.timeout(8000) });
        if (oembedRes.ok) videoInfo = await oembedRes.json();
      } catch {}

      // ═══ 2) التعليقات (من input المستخدم) ═══
      let comments: string[] = [];
      if (commentsText) {
        comments = commentsText.split(/\n/).map((c) => c.trim()).filter((c) => c.length > 5).slice(0, 30);
      }

      // ═══ 3) تحليل ═══
      const analysisInput = {
        video: {
          title: videoInfo.title || "",
          author: videoInfo.author_name || "",
          description: "",
        },
        comments_count: comments.length,
        comments: comments.slice(0, 15),
      };

      const analysis = await callGLMForJSON({
        systemPrompt: `أنت محلل محتوى يوتيوب. حلل الفيديو${comments.length > 0 ? ` و ${comments.length} تعليق` : ""}.
${comments.length === 0 ? "ملاحظة: مفيش تعليقات متاحة — حلل العنوان والقناة فقط." : ""}
رجّع JSON: {"sentiment":{"positive":0,"negative":0,"overall":""},"topics":[],"questions":[],"summary":"","recommendation":""}`,
        userMessage: JSON.stringify(analysisInput).slice(0, 2000),
        maxTokens: 800,
        temperature: 0.3,
      });

      return {
        success: true,
        data: {
          scenario: "youtube_insights",
          video_id: videoId,
          video_title: videoInfo.title || "",
          video_author: videoInfo.author_name || "",
          video_thumbnail: videoInfo.thumbnail_url || "",
          comments_provided: comments.length,
          steps: {
            fetch_video: !!videoInfo.title,
            has_comments: comments.length > 0,
            analyze: !!analysis.data?.summary,
          },
          analysis: analysis.data || {},
          note: comments.length === 0 ? "مفيش تعليقات متاحة. للتحليل الكامل، مرر التعليقات في parameter 'comments'." : undefined,
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
