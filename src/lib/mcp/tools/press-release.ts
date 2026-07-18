/**
 * MCP Tool: Press Release Writer
 * فكرة من: AI PR / announcement templates
 * بيكتب بيان صحفي احترافي.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const pressReleaseTool: MCPTool = {
  name: "press_release",
  description: "اكتب بيان صحفي (press release) احترافي. استخدمها لما المستخدم يقول 'بيان صحفي' أو 'press release' أو 'إعلان رسمي'.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "عنوان البيان" },
      announcement: { type: "string", description: "إيه اللي بتعلنه (منتج جديد، شراكة، حدث...)" },
      company: { type: "string", description: "اسم الشركة (اختياري)" },
      contact: { type: "string", description: "بيانات التواصل (اختياري)" },
    },
    required: ["title", "announcement"],
  },
  async execute(params) {
    const title = String(params.title || "");
    const announcement = String(params.announcement || "");
    const company = String(params.company || "");
    const contact = String(params.contact || "");
    if (!title || !announcement) return { success: false, error: "title و announcement مطلوبين" };
    try {
      const systemMsg = `أنت كاتب بيانات صحفية محترف. اكتب بيان صحفي بالعربي عن:
العنوان: "${title}"
الإعلان: "${announcement}"
${company ? `الشركة: ${company}` : ""}

البنية المطلوبة (standard PR format):
1. FOR IMMEDIATE RELEASE
2. العنوان (جذاب وواضح)
3. المدينة والتاريخ
4. الفقرة الأولى (lead paragraph) — من/إيه/متى/فيين/ليه
5. 2-3 فقرات تفاصيل + اقتباس (ممكن تخترعه)
6. About الشركة (boilerplate)
${contact ? `7. Contact: ${contact}` : "7. Contact: [بيانات التواصل]"}

رجّع JSON فقط:
{"headline":"","dateline":"","body":{"lead":"","details":[],"quote":{"text":"","attributed_to":""}},"boilerplate":"","contact":"","full_text":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: `${title}\n${announcement}`,
        maxTokens: 2500,
        temperature: 0.5,
      });
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
