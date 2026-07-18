/**
 * MCP Tool: Markdown to HTML Renderer
 * بيحوّل Markdown لـ HTML (محلي، بدون API خارجي).
 * بيدعم: headings, bold, italic, links, images, code, lists, quotes, tables.
 */
import type { MCPTool } from "../types";

export const markdownRenderTool: MCPTool = {
  name: "markdown_render",
  description: "حوّل Markdown لـ HTML (محلي). استخدمها لما المستخدم يقول 'markdown' أو 'md' أو 'حوّل لـ html'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص بـ Markdown" },
      fullHtml: { type: "boolean", description: "HTML كامل بـ <html><body> (افتراضي: false)", default: false },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const fullHtml = Boolean(params.fullHtml);

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 50000) return { success: false, error: "النص طويل جداً (حد 50000 حرف)" };

    try {
      const html = markdownToHtml(text);
      const fullDocument = fullHtml
        ? `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>
${html}
</body>
</html>`
        : html;

      return {
        success: true,
        data: {
          markdown_length: text.length,
          html_length: fullDocument.length,
          html: fullDocument,
          plain_text: htmlToPlain(html).slice(0, 500),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

/** تحويل Markdown لـ HTML */
function markdownToHtml(md: string): string {
  let html = md;

  // escape HTML special chars الأول (باستثناء code blocks)
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${lang || "text"}">${escapeHtml(code.trim())}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // inline code
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINECODE${idx}\x00`;
  });

  // escape الباقي
  html = escapeHtml(html);

  // headings (h1-h6)
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // horizontal rule
  html = html.replace(/^---+\s*$/gm, "<hr>");

  // blockquote
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/(<blockquote>[\s\S]*?<\/blockquote>)(?!\n<blockquote>)/g, (m) => m);

  // bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");

  // strikethrough
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // unordered lists
  html = html.replace(/^[\*\-]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, "<ul>$1</ul>");

  // ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

  // tables (basic support)
  html = html.replace(/^\|(.+)\|\s*$/gm, (match, content) => {
    const cells = content.split("|").map((c: string) => c.trim());
    if (cells.every((c: string) => /^[-:]+$/.test(c))) return ""; // separator row
    const tds = cells.map((c: string) => `<td>${c}</td>`).join("");
    return `<tr>${tds}</tr>`;
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)(?!\n<tr>)/g, "<table>$1</table>");

  // paragraphs (الأسطر الفاضية)
  html = html
    .split(/\n\n+/)
    .map((block) => {
      if (
        block.startsWith("<h") ||
        block.startsWith("<ul>") ||
        block.startsWith("<ol>") ||
        block.startsWith("<blockquote>") ||
        block.startsWith("<pre>") ||
        block.startsWith("<hr") ||
        block.startsWith("<table>") ||
        block.startsWith("\x00")
      ) {
        return block;
      }
      return block.trim() ? `<p>${block.replace(/\n/g, "<br>")}</p>` : "";
    })
    .join("\n");

  // restore code blocks + inline code
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)] || "");
  html = html.replace(/\x00INLINECODE(\d+)\x00/g, (_, idx) => inlineCodes[parseInt(idx)] || "");

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
