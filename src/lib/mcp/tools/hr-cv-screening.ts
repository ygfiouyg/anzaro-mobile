/**
 * MCP Tool: HR CV Screening
 * سيناريو: تحليل سير ذاتية + تقييم مرشحين
 * 
 * إصلاح: اقبل فواصل متعددة بين الـ CVs (---، \n\n، أو CV 1:)
 * 
 * n8n template: "AI Automated HR Workflow for CV Analysis and Candidate Evaluation"
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const hrCvScreeningTool: MCPTool = {
  name: "hr_cv_screening",
  description: "تحليل سير ذاتية + تقييم مرشحين (سيناريو متكامل). استخدمها لما المستخدم يقول 'حلل سير ذاتية' أو 'قيّم مرشحين'. اقبل الـ CVs مفصولة بـ --- أو سطر فارغ.",
  parameters: {
    type: "object",
    properties: {
      jobTitle: { type: "string", description: "المسمى الوظيفي" },
      requirements: { type: "string", description: "المتطلبات (مهارات، خبرة، تعليم)" },
      cvs: { type: "string", description: "السير الذاتية (مفصولة بـ --- أو سطر فارغ أو CV 1:)" },
    },
    required: ["jobTitle", "requirements", "cvs"],
  },
  async execute(params) {
    const jobTitle = String(params.jobTitle || "").trim();
    const requirements = String(params.requirements || "").trim();
    const cvsText = String(params.cvs || "").trim();
    if (!jobTitle || !requirements || !cvsText) return { success: false, error: "jobTitle, requirements, cvs كلهم مطلوبين" };

    try {
      // ═══ الخطوة 1: قسّم الـ CVs بفواصل متعددة ═══
      let cvs: string[];
      if (cvsText.includes("---")) {
        cvs = cvsText.split(/\n?---\n?/).map((c) => c.trim()).filter(Boolean);
      } else if (/\n\s*\n/.test(cvsText)) {
        // سطر فارغ بين كل CV
        cvs = cvsText.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
      } else if (/CV\s*\d+/i.test(cvsText)) {
        // CV 1:, CV 2:
        cvs = cvsText.split(/(?=CV\s*\d+\s*:?\s*)/i).map((c) => c.trim()).filter(Boolean);
      } else {
        // كل السطر واحد CV
        cvs = [cvsText];
      }

      cvs = cvs.slice(0, 10);

      // ═══ الخطوة 2: تحليل ═══
      const analysis = await callGLMForJSON({
        systemPrompt: `أنت خبير HR. حلل ${cvs.length} سيرة ذاتية لشغل "${jobTitle}".
المتطلبات: ${requirements}

لكل مرشح: match_score (0-100)، matched_skills، missing_skills، recommendation (hire/maybe/reject)، 2 أسئلة مقابلة.
ثم رتّب المرشحين.

رجّع JSON:
{
  "candidates": [{"name":"","match_score":0,"matched_skills":[],"missing_skills":[],"recommendation":"","interview_questions":[]}],
  "ranking": [],
  "summary": "",
  "top_candidate": ""
}`,
        userMessage: cvs.map((c, i) => `CV ${i + 1}:\n${c}`).join("\n\n---\n\n").slice(0, 4000),
        maxTokens: 2000,
        temperature: 0.3,
      });

      const candidates = analysis.data?.candidates || [];
      return {
        success: true,
        data: {
          scenario: "hr_cv_screening",
          job_title: jobTitle,
          requirements,
          cvs_analyzed: cvs.length,
          steps: { parse: true, analyze: candidates.length > 0, rank: !!analysis.data?.ranking },
          candidates,
          ranking: analysis.data?.ranking || [],
          summary: analysis.data?.summary || "",
          top_candidate: analysis.data?.top_candidate || "",
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
