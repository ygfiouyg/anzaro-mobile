/**
 * MCP Tool: Podcast Summarizer
 * سيناريو: اقرأ transcript بودكاست → لخّص → ابحث في ويكيبيديا → عزّز
 * n8n template: "AI: Summarize podcast episode and enhance using Wikipedia"
 * 
 * الخطوات:
 * 1. اقرأ النص (transcript)
 * 2. لخّص النقاط الرئيسية
 * 3. ابحث في ويكيبيديا عن المصطلحات
 * 4. ولّد تقرير معزّز
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const podcastSummarizerTool: MCPTool = {
  name: "podcast_summarizer",
  description: "لخّص حلقة بودكاست + عزّز بمعلومات ويكيبيديا (سيناريو متكامل). استخدمها لما المستخدم يقول 'لخّص بودكاست' أو 'podcast summary'.",
  parameters: {
    type: "object",
    properties: {
      transcript: { type: "string", description: "نص الحلقة (transcript)" },
      episodeTitle: { type: "string", description: "عنوان الحلقة (اختياري)", default: "" },
    },
    required: ["transcript"],
  },
  async execute(params) {
    const transcript = String(params.transcript || "").trim();
    const episodeTitle = String(params.episodeTitle || "").trim();
    if (!transcript) return { success: false, error: "transcript مطلوب" };
    if (transcript.length < 100) return { success: false, error: "النص قصير جداً" };

    try {
      // ═══ 1) لخّص + استخرج مصطلحات ═══
      const summary = await callGLMForJSON({
        systemPrompt: `أنت ملخّص بودكاست محترف. لخّص الحلقة دي${episodeTitle ? ` "${episodeTitle}"` : ""}.

استخرج:
1. ملخص (3-5 أسطر)
2. النقاط الرئيسية (5-10 نقاط)
3. مصطلحات/مواضيع تستحق بحث في ويكيبيديا (3-5)
4. اقتباسات مهمة
5. مدة تقديرية للقراءة

رجّع JSON:
{
  "summary": "",
  "key_points": [],
  "wiki_topics": ["موضوع 1", "موضوع 2"],
  "quotes": [],
  "topics_discussed": []
}`,
        userMessage: transcript.slice(0, 5000),
        maxTokens: 1000,
        temperature: 0.3,
      });

      const result = summary.data || {};
      const wikiTopics = result.wiki_topics || [];

      // ═══ 2) ابحث في ويكيبيديا عن المصطلحات ═══
      const wikiEnhancements: any[] = [];
      for (const topic of wikiTopics.slice(0, 3)) {
        try {
          const wikiRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (wikiRes.ok) {
            const wd: any = await wikiRes.json();
            const searchResult = wd.query?.search?.[0];
            if (searchResult) {
              const sumRes = await fetch(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchResult.title)}`,
                { signal: AbortSignal.timeout(5000) }
              );
              if (sumRes.ok) {
                const sd: any = await sumRes.json();
                wikiEnhancements.push({
                  topic,
                  wiki_title: sd.title || "",
                  wiki_extract: (sd.extract || "").slice(0, 200),
                  wiki_url: sd.content_urls?.desktop?.page || "",
                });
              }
            }
          }
        } catch {}
      }

      return {
        success: true,
        data: {
          scenario: "podcast_summarizer",
          episode_title: episodeTitle || "غير محدد",
          transcript_length: transcript.length,
          steps: {
            summarize: !!result.summary,
            extract_topics: wikiTopics.length > 0,
            wiki_enhance: wikiEnhancements.length > 0,
          },
          summary: result.summary || "",
          key_points: result.key_points || [],
          topics_discussed: result.topics_discussed || [],
          quotes: result.quotes || [],
          wiki_enhancements: wikiEnhancements,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
