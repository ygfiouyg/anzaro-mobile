/**
 * MCP Tool: Notion Create Page
 * تكامل حقيقي مع Notion API — إنشاء صفحة في database.
 * محتاج NOTION_API_KEY env var.
 */
import type { MCPTool } from "../types";

export const notionCreatePageTool: MCPTool = {
  name: "notion_create_page",
  description: "أنشئ صفحة في Notion database (API حقيقي). استخدمها لما المستخدم يقول 'notion' أو 'أنشئ صفحة notion'.",
  parameters: {
    type: "object",
    properties: {
      databaseId: { type: "string", description: "ID الـ Notion database" },
      title: { type: "string", description: "عنوان الصفحة" },
      content: { type: "string", description: "محتوى الصفحة (نص)" },
    },
    required: ["databaseId", "title"],
  },
  async execute(params) {
    const databaseId = String(params.databaseId || "").trim();
    const title = String(params.title || "").trim();
    const content = String(params.content || "");

    if (!databaseId || !title) {
      return { success: false, error: "databaseId و title مطلوبين" };
    }

    const apiKey = process.env.NOTION_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "NOTION_API_KEY env var مش متاح. أنشئ integration من notion.so/my-integrations",
      };
    }

    try {
      // بناء children blocks لو فيه content
      const children: any[] = [];
      if (content) {
        // نقسم المحتوى لفقرات
        const paragraphs = content.split("\n\n").filter(Boolean);
        for (const p of paragraphs.slice(0, 20)) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: p.slice(0, 2000) } }],
            },
          });
        }
      }

      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties: {
            title: {
              title: [{ type: "text", text: { content: title } }],
            },
          },
          ...(children.length > 0 ? { children } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `Notion API error ${res.status}: ${errText.slice(0, 300)}` };
      }

      const data: any = await res.json();

      return {
        success: true,
        data: {
          pageId: data.id,
          url: data.url,
          title,
          databaseId,
          createdTime: data.created_time,
          blocksAdded: children.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
