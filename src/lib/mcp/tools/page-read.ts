/**
 * MCP Tool — Page Reader
 * ======================
 * قراءة محتوى صفحة ويب (URL) واستخراج النص المفيد منها.
 */
import type { MCPTool } from "../types";
import { mcpPageReader } from "@/lib/ai-tools/mcp-tools";

export const pageReadTool: MCPTool = {
  name: "page_read",
  description:
    "Read the content of a web page (URL) and extract its title and main text content. Use this after web_search to read full articles, or for any URL the user provides.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL of the page to read (e.g. 'https://example.com/article').",
      },
    },
    required: ["url"],
  },
  async execute(params) {
    const url = String(params.url || "").trim();

    if (!url) {
      return { success: false, error: "url مطلوبة" };
    }

    if (!/^https?:\/\//i.test(url)) {
      return { success: false, error: "url لازم تبدأ بـ http:// أو https://" };
    }

    const result = await mcpPageReader(url);

    if (!result.success) {
      return { success: false, error: result.error || "فشل قراءة الصفحة" };
    }

    return {
      success: true,
      data: {
        url,
        title: result.title || "",
        content: result.content || "",
        contentLength: (result.content || "").length,
      },
    };
  },
};
