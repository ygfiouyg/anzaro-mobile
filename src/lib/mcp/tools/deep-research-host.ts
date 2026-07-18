/**
 * MCP Tool: Deep Research Host
 * النواة الصلبة #2: "Host Your Own AI Deep Research Agent with n8n, Apify and OpenAI o3"
 * 
 * الخطوات:
 * 1. حلل السؤال → قسّمه لأسئلة فرعية
 * 2. ابحث في Wikipedia عن كل سؤال فرعي
 * 3. ادمج كل النتائج → تقرير موثق
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const deepResearchHostTool: MCPTool = {
  name: "deep_research_host",
  description: "بحث عميق ذاتي — يقسم السؤال لأسئلة فرعية + يبحث + يدمج (سيناريو متكامل). استخدمها لما المستخدم يقول 'hosted research' أو 'deep research agent'.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "سؤال البحث" },
    },
    required: ["question"],
  },
  async execute(params) {
    const question = String(params.question || "").trim();
    if (!question) return { success: false, error: "question مطلوب" };
    try {
      // 1) قسّم لأسئلة فرعية
      const split = await callGLMForJSON({
        systemPrompt: `قسّم السؤال ده لـ 3 أسئلة فرعية أساسية: "${question}"
رجّع JSON: {"sub_questions":["س1","س2","س3"]}`,
        userMessage: question, maxTokens: 200, temperature: 0.3,
      });
      const subQs = split.data?.sub_questions || [question];

      // 2) ابحث في Wikipedia لكل سؤال فرعي
      const subResults: any[] = [];
      for (const sq of subQs.slice(0, 3)) {
        let info: any = null;
        try {
          const wr = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(sq)}&srlimit=1&format=json&origin=*`, { signal: AbortSignal.timeout(5000) });
          if (wr.ok) { const wd: any = await wr.json(); const r = wd.query?.search?.[0]; if (r) { const sr = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(r.title)}`, { signal: AbortSignal.timeout(4000) }); if (sr.ok) { const sd: any = await sr.json(); info = { question: sq, title: sd.title, extract: (sd.extract || "").slice(0, 300), url: sd.content_urls?.desktop?.page || "" }; } } }
        } catch {}
        subResults.push(info || { question: sq, title: "غير متاح", extract: "", url: "" });
      }

      // 3) دمج
      const report = await callGLMForJSON({
        systemPrompt: `أنت باحث. ادمج النتائج دي في تقرير عن: "${question}"
${subResults.map((r, i) => `سؤال ${i + 1}: ${r.question}\nإجابة: ${r.extract}`).join("\n\n")}
رجّع JSON: {"summary":"","key_findings":[],"sources":[{"title":"","url":""}],"confidence":""}`,
        userMessage: question, maxTokens: 400, temperature: 0.4,
      });

      return { success: true, data: { scenario: "deep_research_host", question, sub_questions: subQs, steps: { split: subQs.length > 1, search: subResults.length > 0, merge: !!report.data?.summary }, sub_results: subResults, report: report.data || {} } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
