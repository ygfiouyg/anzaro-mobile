/**
 * MCP Tool: Story Writer
 * فكرة من: "AI-Powered Children's Arabic Storytelling on Telegram"
 * بيكتب قصة قصيرة إبداعية.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const storyWriterTool: MCPTool = {
  name: "story_writer",
  description: "اكتب قصة قصيرة إبداعية. استخدمها لما المستخدم يقول 'قصة' أو 'story' أو 'احكي'.",
  parameters: {
    type: "object",
    properties: {
      theme: { type: "string", description: "موضوع/فكرة القصة" },
      audience: { type: "string", description: "الجمهور: children, teens, adults", default: "adults" },
      length: { type: "string", description: "الطول: short (300ك), medium (700ك), long (1500ك)", default: "medium" },
      genre: { type: "string", description: "النوع: adventure, fantasy, drama, sci-fi, comedy", default: "drama" },
    },
    required: ["theme"],
  },
  async execute(params) {
    const theme = String(params.theme || "");
    const audience = String(params.audience || "adults");
    const length = String(params.length || "medium");
    const genre = String(params.genre || "drama");
    if (!theme) return { success: false, error: "theme مطلوب" };
    try {
      const lengthMap: Record<string, number> = { short: 300, medium: 700, long: 1500 };
      const wordCount = lengthMap[length] || 700;
      const systemMsg = `أنت كاتب قصص محترف. اكتب قصة ${genre} عن: "${theme}"
الجمهور: ${audience}. الطول التقريبي: ${wordCount} كلمة.

القصة لازم تحتوي على:
- مقدمة تشد القارئ
- شخصيات واضحة (2-4 شخصيات)
- صراع/مشكلة
- ذروة (climax)
- نهاية مرضية (ممكن مفتوحة)

${audience === "children" ? "اللغة بسيطة ومناسبة للأطفال، مفيش عنف أو مواضيع غير مناسبة." : ""}
${audience === "teens" ? "اللغة شبابية، المواضيع مناسبة للمراهقين." : ""}

رجّع JSON فقط:
{"title":"","genre":"","characters":[{"name":"","role":""}],"plot_summary":"","story":"","word_count":0,"moral":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: theme,
        maxTokens: 4000,
        temperature: 0.8,
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
