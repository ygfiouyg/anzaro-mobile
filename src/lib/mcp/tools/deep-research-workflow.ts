/**
 * MCP Tool: Deep Research Workflow
 * النواة الصلبة #1: "Open Deep Research - AI-Powered Autonomous Research Workflow"
 * 
 * الخطوات:
 * 1. حلل سؤال البحث → استخرج كلمات مفتاحية
 * 2. ابحث في Wikipedia عن تعريف أساسي
 * 3. ابحث في Hacker News عن نقاشات حديثة
 * 4. ابحث في Reddit (RSS) عن آراء المجتمع
 * 5. لخّص كل المصادر → تقرير بحثي موثق
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const deepResearchWorkflowTool: MCPTool = {
  name: "deep_research_workflow",
  description: "بحث عميق متعدد المراحل — تحليل + Wikipedia + HN + Reddit + تقرير موثق (سيناريو متكامل). استخدمها لما المستخدم يقول 'بحث عميق' أو 'research' أو 'دراسة شاملة'.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "سؤال البحث" },
      depth: { type: "string", description: "عمق: quick, standard, deep (افتراضي: standard)", default: "standard" },
    },
    required: ["question"],
  },
  async execute(params) {
    const question = String(params.question || "").trim();
    const depth = String(params.depth || "standard").toLowerCase();
    if (!question) return { success: false, error: "question مطلوب" };

    try {
      // ═══ الخطوة 1: تحليل السؤال + استخراج كلمات مفتاحية ═══
      const analysis = await callGLMForJSON({
        systemPrompt: `حلل سؤال البحث ده: "${question}"
استخرج: 3 كلمات مفتاحية للبحث + نوع السؤال (factual, opinion, technical, how-to)
رجّع JSON: {"keywords":["كلمة1","كلمة2","كلمة3"],"question_type":"","search_strategy":""}`,
        userMessage: question,
        maxTokens: 200,
        temperature: 0.3,
      });

      const keywords = analysis.data?.keywords || [question.split(/\s+/)[0]];
      const questionType = analysis.data?.question_type || "general";
      const searchQuery = keywords.slice(0, 3).join(" ");

      // ═══ الخطوة 2: Wikipedia ═══
      let wikiSource: any = null;
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srlimit=1&format=json&origin=*`,
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
              wikiSource = { title: sd.title, extract: (sd.extract || "").slice(0, 400), url: sd.content_urls?.desktop?.page || "" };
            }
          }
        }
      } catch {}

      // ═══ الخطوة 3: Hacker News ═══
      let hnSources: any[] = [];
      try {
        const hnRes = await fetch(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(searchQuery)}&tags=story&hitsPerPage=5&numericFilters=points>10`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (hnRes.ok) {
          const hd: any = await hnRes.json();
          hnSources = (hd.hits || []).map((h: any) => ({
            title: h.title || "",
            url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
            points: h.points || 0,
            comments: h.num_comments || 0,
            date: h.created_at ? new Date(h.created_at).toISOString().split("T")[0] : "",
          }));
        }
      } catch {}

      // ═══ الخطوة 4: Reddit RSS ═══
      let redditSources: any[] = [];
      try {
        const rdRes = await fetch(
          `https://www.reddit.com/search.rss?q=${encodeURIComponent(searchQuery)}&limit=3&sort=relevance`,
          { headers: { "User-Agent": "DeltaAI/1.0" }, signal: AbortSignal.timeout(8000) }
        );
        if (rdRes.ok) {
          const xml = await rdRes.text();
          const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
          let m;
          while ((m = entryRe.exec(xml)) && redditSources.length < 3) {
            const title = m[1].match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/&amp;/g, "&") || "";
            const link = m[1].match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
            if (title) redditSources.push({ title, url: link });
          }
        }
      } catch {}

      // ═══ الخطوة 5: تقرير شامل موثق ═══
      const sourcesText = `Wikipedia: ${wikiSource?.extract || "غير متاح"}
HN: ${hnSources.map((s) => s.title).join("، ") || "غير متاح"}
Reddit: ${redditSources.map((s) => s.title).join("، ") || "غير متاح"}`;

      const report = await callGLMForJSON({
        systemPrompt: `أنت باحث محترف. بناءً على المصادر، اكتب تقرير بحثي عن: "${question}"
نوع السؤال: ${questionType}
${depth === "deep" ? "اكتب تقرير مفصل وموثق" : "اكتب تقرير متوسط"}

رجّع JSON:
{
  "executive_summary": "ملخص 3 أسطر",
  "key_findings": ["اكتشاف 1","اكتشاف 2","اكتشاف 3"],
  "analysis": "تحليل مفصل",
  "citations": [{"source":"","title":"","url":""}],
  "confidence": "high|medium|low",
  "gaps": ["ما يحتاج بحث إضافي"],
  "recommendations": ["توصية"]
}`,
        userMessage: sourcesText.slice(0, 1200),
        maxTokens: depth === "deep" ? 600 : 400,
        temperature: 0.4,
      });

      const r = report.data || {};

      return {
        success: true,
        data: {
          scenario: "deep_research_workflow",
          question,
          depth,
          question_type: questionType,
          keywords,
          steps: {
            analyze_question: !!questionType,
            search_wikipedia: !!wikiSource,
            search_hn: hnSources.length > 0,
            search_reddit: redditSources.length > 0,
            synthesize: !!r.executive_summary,
          },
          sources: { wikipedia: wikiSource, hacker_news: hnSources, reddit: redditSources },
          report: {
            executive_summary: r.executive_summary || "",
            key_findings: r.key_findings || [],
            analysis: r.analysis || "",
            citations: r.citations || [],
            confidence: r.confidence || "low",
            gaps: r.gaps || [],
            recommendations: r.recommendations || [],
          },
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
