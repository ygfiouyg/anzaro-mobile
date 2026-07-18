/**
 * MCP Tool: Blog Writer Pipeline
 * ===============================
 * فكرة من: AI Blog Writer Pipeline with Ollama
 * بحث → outline → كتابة → مراجعة
 */

import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";
import { mcpWebSearch } from "@/lib/ai-tools/mcp-tools";

export const blogWriterTool: MCPTool = {
  name: "blog_write",
  description: "اكتب blog/article كامل: بحث → outline → كتابة → مراجعة. استخدمها لما المستخدم يقول 'مقال' أو 'blog' أو 'article'.",
  parameters: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "موضوع المقال",
      },
      language: {
        type: "string",
        description: "اللغة (افتراضي: ar)",
        default: "ar",
      },
    },
    required: ["topic"],
  },
  async execute(params) {
    const topic = String(params.topic || "");
    const language = String(params.language || "ar");
    if (!topic) return { success: false, error: "topic مطلوب" };

    try {
      // Step 1: Research
      const searchResult = await mcpWebSearch(topic, 5);
      const researchData = searchResult.success ? searchResult.results : [];

      // Step 2: Outline + Draft + Polish (كلها في call واحد)
      const result = await callGLMForJSON({
        systemPrompt: `أنت كاتب محتوى محترف. اكتب مقال/blog كامل عن الموضوع التالي.

الخطوات:
1. اعمل outline (عناوين رئيسية)
2. اكتب كل قسم بالتفصيل
3. راجع وحسّن الأسلوب

استخدم البيانات البحثية التالية:
${JSON.stringify(researchData).slice(0, 3000)}

اللغة: ${language === "ar" ? "عربي" : "English"}

رجّع JSON فقط:
{
  "title": "عنوان المقال",
  "article": "المقال كامل بصيغة markdown — استخدم # للعنوان الرئيسي، ## للأقسام، وفقرات بينها. ابدأ بـ # ${topic} ثم ## مقدمة، الأقسام، ## خاتمة، ## مصادر.",
  "outline": ["مقدمة", "قسم 1", "قسم 2", "خاتمة"]
}`,
        userMessage: `اكتب مقال عن: ${topic}`,
        maxTokens: 8192,
        temperature: 0.7,
      });

      if (result.success) {
        return {
          success: true,
          data: {
            topic,
            ...result.data,
            sources: researchData,
          },
        };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
