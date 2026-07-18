/**
 * MCP Tool: AI Research Agent
 * سيناريو: بحث عميق ذاتي من مصادر متعددة + تحليل + تقرير
 * 
 * إصلاحات:
 * 1. اصلح بحث HN — استخدم query أبسط
 * 2. قلل البيانات المرسلة لـ GLM (عناوين بس مش محتوى كامل)
 * 3. استخدم prompt أقصر
 * 
 * n8n template: "Open Deep Research - AI-Powered Autonomous Research Workflow"
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const aiResearchAgentTool: MCPTool = {
  name: "ai_research_agent",
  description: "بحث عميق ذاتي — يجمع من Wikipedia + Hacker News + يولّد تقرير (سيناريو متكامل). استخدمها لما المستخدم يقول 'ابحث بشكل عميق' أو 'research' أو 'دراسة'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "سؤال البحث" },
      depth: { type: "string", description: "عمق: quick, standard, deep (افتراضي: standard)", default: "standard" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const depth = String(params.depth || "standard").toLowerCase();
    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      const sources: any = {};

      // ═══ 1) Wikipedia ═══
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`,
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
              sources.wikipedia = {
                title: sd.title || "",
                extract: (sd.extract || "").slice(0, 500),
                url: sd.content_urls?.desktop?.page || "",
              };
            }
          }
        }
      } catch {}

      // ═══ 2) Hacker News — ابحث بكلمة واحدة بدل الجملة كاملة ═══
      try {
        // استخدم أول كلمتين من الاستعلام لتحسين النتائج
        const shortQuery = query.split(/\s+/).slice(0, 3).join(" ");
        const hnRes = await fetch(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(shortQuery)}&tags=story&hitsPerPage=5`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (hnRes.ok) {
          const hd: any = await hnRes.json();
          sources.hacker_news = (hd.hits || []).map((h: any) => ({
            title: h.title || h.story_title || "",
            url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
            points: h.points || 0,
            comments: h.num_comments || 0,
          }));
        }
      } catch {}

      // ═══ 3) Synthesize — استخدم prompt قصير ═══
      // اجمع العناوين بس لترسلها لـ GLM
      const wikiSummary = sources.wikipedia?.extract || "";
      const hnTitles = (sources.hacker_news || []).map((h: any) => `- ${h.title}`).join("\n");

      const synthesisInput = `سؤال البحث: ${query}
مرجع Wikipedia: ${wikiSummary.slice(0, 300)}
مرجع Hacker News:
${hnTitles}`;

      const synthesis = await callGLMForJSON({
        systemPrompt: `أنت باحث ذكي. بناءً على المصادر، ولّد تقرير بحثي عن "${query}".
رجّع JSON بسيط:
{
  "summary": "ملخص 3-4 أسطر",
  "key_findings": ["اكتشاف 1", "اكتشاف 2", "اكتشاف 3"],
  "sources": [{"title":"","url":""}],
  "confidence": "high|medium|low"
}`,
        userMessage: synthesisInput.slice(0, 1500),
        maxTokens: 800,
        temperature: 0.4,
      });

      const report = synthesis.data || {};

      return {
        success: true,
        data: {
          scenario: "ai_research_agent",
          query,
          depth,
          sources_collected: {
            wikipedia: !!sources.wikipedia,
            hacker_news: (sources.hacker_news || []).length,
          },
          steps: {
            search_wikipedia: !!sources.wikipedia,
            search_hn: (sources.hacker_news || []).length > 0,
            synthesize: !!report.summary,
          },
          sources,
          report: {
            summary: report.summary || "تعذر توليد التقرير — حاول مرة أخرى",
            key_findings: report.key_findings || [],
            sources: report.sources || [],
            confidence: report.confidence || "low",
          },
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
